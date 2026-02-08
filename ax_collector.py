"""
AX 키워드 나라장터 공고 수집 → Firestore (g2b-bid-finder) 적재 모듈.

- API 키: BID_API_KEY (config.py에서 공유)
- Firebase: FIREBASE_CREDENTIALS2 환경변수 (또는 로컬 JSON 파일)
- firebase_admin 앱: 'ax_firestore' (RTDB 기본 앱과 분리)
"""

import base64
import math
import os
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta
from urllib.parse import unquote

import requests
import firebase_admin
from firebase_admin import credentials, firestore

from config import BID_API_KEY

# ── 상수 ──────────────────────────────────────────────
BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch"
KEYWORD = "AX"
ROWS_PER_PAGE = 50
DATE_FMT = "%Y%m%d%H%M"
CHUNK_DAYS = 3
FIREBASE_COLLECTION = "bid_pblanc_list"
FIREBASE_META_COLLECTION = "meta"
FIREBASE_META_DOC = "collection_state"
APP_NAME = "ax_firestore"  # RTDB 기본 앱과 분리


# ── 시간 유틸 ─────────────────────────────────────────
def _now_kst() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul"))
    except Exception:
        return datetime.now()


def _ensure_kst(dt: datetime) -> datetime:
    try:
        from zoneinfo import ZoneInfo
        KST = ZoneInfo("Asia/Seoul")
        if dt.tzinfo is None:
            return dt.replace(tzinfo=KST)
        return dt.astimezone(KST)
    except Exception:
        return dt


# ── Private Key 보정 ──────────────────────────────────
def _fix_private_key(pem_str: str) -> str:
    """
    private_key의 base64 데이터에서 중복 구간을 찾아 제거한다.
    일부 서비스 계정 JSON의 private_key에 중복 base64 세그먼트가 포함되어
    DER 파싱 시 'extra data' 또는 'Invalid private key' 에러가 발생하는 경우 대비.
    """
    if not pem_str or "-----BEGIN" not in pem_str:
        return pem_str

    lines = pem_str.strip().split("\n")
    header = lines[0]   # -----BEGIN PRIVATE KEY-----
    footer = lines[-1]  # -----END PRIVATE KEY-----
    b64_body = "".join(lines[1:-1])

    try:
        der_data = base64.b64decode(b64_body)
    except Exception:
        return pem_str  # base64 디코딩 실패 → 원본 반환

    # ASN.1 SEQUENCE 태그: 0x30, 길이 인코딩: 0x82 = 2바이트 길이
    if len(der_data) < 4 or der_data[0] != 0x30 or der_data[1] != 0x82:
        return pem_str  # 예상하지 못한 형식 → 원본 반환

    # 2바이트 길이 파싱 (big-endian)
    content_length = (der_data[2] << 8) | der_data[3]
    expected_total = content_length + 4  # tag(1) + length_marker(1) + length_bytes(2)

    if len(der_data) <= expected_total:
        return pem_str  # 이미 정상 크기 → 원본 반환

    extra_bytes = len(der_data) - expected_total
    print(f"[AX] private_key에 {extra_bytes}바이트 여분 데이터 감지. base64 중복 구간 검색...")

    # 여분 바이트에 대응하는 base64 문자 수 (3바이트 → 4 base64문자)
    segment_len = (extra_bytes * 4 + 2) // 3  # 18바이트 → 24문자

    # base64 텍스트에서 연속 중복 구간 탐색 (ABAB → AB 로 축소)
    for i in range(len(b64_body) - segment_len * 2 + 1):
        segment = b64_body[i:i + segment_len]
        # 바로 다음에 같은 세그먼트가 반복되는지 확인
        if b64_body[i + segment_len:i + segment_len * 2] == segment:
            fixed_b64 = b64_body[:i] + b64_body[i + segment_len:]
            try:
                fixed_der = base64.b64decode(fixed_b64)
                if len(fixed_der) == expected_total:
                    print(f"[AX] 중복 구간 발견 및 제거 완료: 위치 {i}, {segment_len}문자 ({extra_bytes}바이트)")
                    b64_lines = [fixed_b64[j:j + 64] for j in range(0, len(fixed_b64), 64)]
                    return header + "\n" + "\n".join(b64_lines) + "\n" + footer + "\n"
            except Exception:
                continue

    # 중복 구간을 찾지 못한 경우: DER 끝에서 잘라냄 (fallback)
    print(f"[AX] 중복 구간 미발견. DER 끝에서 {extra_bytes}바이트 잘라냄 (fallback).")
    der_data = der_data[:expected_total]
    b64_fixed = base64.b64encode(der_data).decode()
    b64_lines = [b64_fixed[i:i + 64] for i in range(0, len(b64_fixed), 64)]
    return header + "\n" + "\n".join(b64_lines) + "\n" + footer + "\n"


# ── Firebase 초기화 ───────────────────────────────────
def init_firestore():
    """FIREBASE_CREDENTIALS2 환경변수 또는 로컬 JSON 파일로 Firestore 초기화."""
    # 이미 초기화된 앱이 있으면 재사용
    try:
        app = firebase_admin.get_app(APP_NAME)
        return firestore.client(app=app)
    except ValueError:
        pass  # 앱이 아직 없음 → 초기화 진행

    firebase_credentials2 = os.environ.get('FIREBASE_CREDENTIALS2')

    if firebase_credentials2:
        cred_dict = json.loads(firebase_credentials2)
        # private_key에 여분 바이트가 있으면 보정
        if "private_key" in cred_dict:
            cred_dict["private_key"] = _fix_private_key(cred_dict["private_key"])
        cred = credentials.Certificate(cred_dict)
    else:
        # 로컬 개발용 - 파일 경로로 시도
        local_paths = [
            'g2b-bid-finder-firebase-adminsdk-fbsvc-aae6f1c96d.json',
            '../G2B_Script/g2b-bid-finder-firebase-adminsdk-fbsvc-aae6f1c96d.json',
        ]
        cred = None
        for path in local_paths:
            if os.path.exists(path):
                # 파일에서 로드 후 보정
                with open(path, 'r') as f:
                    cred_dict = json.load(f)
                if "private_key" in cred_dict:
                    cred_dict["private_key"] = _fix_private_key(cred_dict["private_key"])
                cred = credentials.Certificate(cred_dict)
                break
        if cred is None:
            raise FileNotFoundError(
                "FIREBASE_CREDENTIALS2 환경변수가 없고 로컬 JSON 파일도 찾을 수 없습니다."
            )

    app = firebase_admin.initialize_app(cred, name=APP_NAME)
    print(f"[AX] Firestore (g2b-bid-finder) 초기화 완료 (앱: {APP_NAME})")
    return firestore.client(app=app)


# ── API 호출 ──────────────────────────────────────────
def _decode_service_key(key: str) -> str:
    return unquote(key) if "%" in key else key


def fetch_page(page: int, begin: str, end: str, keyword: str = KEYWORD) -> list[dict]:
    """나라장터 API 한 페이지 호출."""
    service_key = _decode_service_key(BID_API_KEY or "").strip()
    params = {
        "serviceKey": service_key,
        "ServiceKey": service_key,
        "pageNo": page,
        "numOfRows": ROWS_PER_PAGE,
        "type": "json",
        "inqryDiv": "1",
        "inqryBgnDt": begin,
        "inqryEndDt": end,
    }
    if keyword:
        params["bidNtceNm"] = keyword

    r = requests.get(BASE_URL, params=params, timeout=20)
    r.raise_for_status()
    payload = r.json()

    if payload["response"]["header"]["resultCode"] != "00":
        raise RuntimeError(payload["response"]["header"]["resultMsg"])

    items = payload["response"]["body"].get("items")
    if not items:
        return []
    if isinstance(items, dict):
        return [items]
    return items


# ── Firestore 헬퍼 ────────────────────────────────────
def get_latest_bid_datetime(db) -> datetime | None:
    """Firestore에서 가장 최근 공고일시를 조회."""
    docs = (
        db.collection(FIREBASE_COLLECTION)
        .order_by("bidNtceDt", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    for doc in docs:
        value = doc.to_dict().get("bidNtceDt")
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value)
            except ValueError:
                continue
    return None


def extract_bid_ordinal(value) -> tuple[str, int]:
    """입찰공고차수(bidNtceOrd) 값에서 순서 키와 숫자 추출."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "", 0
    if isinstance(value, str):
        cleaned = value.strip()
        digits = "".join(ch for ch in cleaned if ch.isdigit())
        order_val = int(digits) if digits else 0
        return cleaned, order_val
    try:
        order_val = int(value)
    except (TypeError, ValueError):
        return "", 0
    return f"{order_val:03d}", order_val


def select_latest_variants(records: list[dict]):
    """같은 공고번호의 여러 차수 중 최신 차수만 유지."""
    latest = {}
    orders_to_remove = defaultdict(set)
    extras = []

    for record in records:
        base_no = str(record.get("bidNtceNo") or "").strip()
        if not base_no:
            extras.append(record)
            continue

        order_raw = record.get("bidNtceOrd")
        order_key, order_value = extract_bid_ordinal(order_raw)

        entry = latest.get(base_no)
        if entry is None:
            latest[base_no] = {
                "record": record,
                "order_val": order_value,
                "order_key": order_key,
            }
        else:
            if order_value > entry["order_val"]:
                if entry["order_key"] != "":
                    orders_to_remove[base_no].add(entry["order_key"])
                entry["record"] = record
                entry["order_val"] = order_value
                entry["order_key"] = order_key
            else:
                if order_key != "":
                    orders_to_remove[base_no].add(order_key)

    keep_records = [info["record"] for info in latest.values()]
    keep_records.extend(extras)
    max_orders = {base: info["order_val"] for base, info in latest.items()}
    keep_order_keys = {base: info["order_key"] for base, info in latest.items()}

    return keep_records, orders_to_remove, max_orders, keep_order_keys


def normalize_record(record: dict) -> dict:
    """Firestore에 저장 가능한 형태로 정규화."""
    normalized = {}
    for key, value in record.items():
        if isinstance(value, datetime):
            normalized[key] = value.isoformat()
        elif value is None:
            normalized[key] = None
        elif isinstance(value, float) and math.isnan(value):
            normalized[key] = None
        else:
            normalized[key] = value
    return normalized


def upsert_firestore(
    records: list[dict],
    db,
    *,
    collected_at=None,
    order_cleanup=None,
    max_orders=None,
    keep_order_keys=None,
) -> int:
    """Firestore에 배치 업서트."""
    if not records:
        print("[AX] Firestore에 적재할 데이터가 없습니다.")
        return 0

    batch = db.batch()
    total = len(records)
    collected_at_dt = _ensure_kst(collected_at) if collected_at else _now_kst()
    collected_at_iso = collected_at_dt.isoformat()

    for idx, record in enumerate(records, start=1):
        normalized = normalize_record(record)
        normalized["collectedAt"] = collected_at_iso
        doc_id = f"{normalized.get('bidNtceNo', '')}-{normalized.get('bidNtceOrd', '')}".strip("-")
        if not doc_id:
            doc_id = normalized.get("untyNtceNo") or f"auto-{idx}"
        doc_ref = db.collection(FIREBASE_COLLECTION).document(doc_id)
        batch.set(doc_ref, normalized, merge=True)
        print(f"  [AX][{idx}/{total}] {normalized.get('bidNtceDt')} | {normalized.get('bidNtceNm')}")

        if idx % 400 == 0:
            batch.commit()
            print(f"  [AX] Firestore 배치 커밋 완료 ({idx}건)")
            batch = db.batch()

    batch.commit()
    print(f"[AX] Firestore 적재 완료: 총 {total}건")

    # 이전 차수 문서 삭제
    if order_cleanup:
        for base_no, orders in order_cleanup.items():
            for order_key in orders:
                doc_id = f"{base_no}-{order_key}".strip("-")
                if not doc_id:
                    continue
                try:
                    db.collection(FIREBASE_COLLECTION).document(doc_id).delete()
                    print(f"  [AX] 이전 차수 삭제: {doc_id}")
                except Exception as exc:
                    print(f"  [AX] 삭제 실패 {doc_id}: {exc}")

    return total


# ── 메인 수집 함수 ────────────────────────────────────
def collect_ax_data() -> dict:
    """
    AX 키워드 공고를 수집하여 Firestore (g2b-bid-finder)에 적재.

    Returns:
        dict: {
            "keyword": "AX",
            "total_collected": int,    # API에서 수신한 총 건수
            "filtered_records": int,   # 키워드 필터 후 건수
            "upserted_records": int,   # Firestore에 적재된 건수
            "bid_details": list[dict], # 이메일용 [{공고명, 채권자명}, ...]
        }
    """
    result = {
        "keyword": KEYWORD,
        "total_collected": 0,
        "filtered_records": 0,
        "upserted_records": 0,
        "bid_details": [],
    }

    if not BID_API_KEY:
        print("[AX] BID_API_KEY가 설정되지 않았습니다. AX 수집을 건너뜁니다.")
        return result

    print(f"\n{'='*50}")
    print(f"🎯 [AX] AX 키워드 Firestore 수집 시작")
    print(f"{'='*50}")

    # Firestore 초기화
    try:
        db = init_firestore()
    except Exception as e:
        print(f"[AX] Firestore 초기화 실패: {e}")
        print("[AX] AX 수집을 건너뜁니다.")
        return result

    # 수집 기간 계산 (Firestore 최신 데이터 기준 증분 수집)
    try:
        from zoneinfo import ZoneInfo
        KST = ZoneInfo("Asia/Seoul")
        default_start = datetime(2025, 1, 1, tzinfo=KST)
    except Exception:
        default_start = datetime(2025, 1, 1)

    end_dt = _now_kst().replace(second=0, microsecond=0)
    start_dt = default_start

    try:
        latest_dt = get_latest_bid_datetime(db)
        if latest_dt:
            latest_dt = _ensure_kst(latest_dt)
            candidate = latest_dt + timedelta(seconds=1)
            if candidate <= end_dt:
                start_dt = candidate
                print(f"[AX] Firestore 최신 공고일시: {latest_dt.isoformat()} → {start_dt.isoformat()}부터 수집")
            else:
                print("[AX] 이미 최신 데이터가 수집되어 있습니다.")
                return result
        else:
            print("[AX] Firestore에 기존 데이터 없음. 기본 시작일(2025-01-01) 사용.")
    except Exception as exc:
        print(f"[AX] Firestore 최신 데이터 조회 실패: {exc}")
        print("[AX] 기본 시작일을 사용합니다.")

    if start_dt >= end_dt:
        print("[AX] 새로 수집할 데이터가 없습니다.")
        return result

    print(f"[AX] 수집 기간: {start_dt.strftime(DATE_FMT)} ~ {end_dt.strftime(DATE_FMT)}")

    # 청크별 데이터 수집
    collected = []
    chunk_start = start_dt

    while chunk_start <= end_dt:
        chunk_end = min(
            chunk_start + timedelta(days=CHUNK_DAYS) - timedelta(minutes=1),
            end_dt
        )
        begin = chunk_start.strftime(DATE_FMT)
        end = chunk_end.strftime(DATE_FMT)
        print(f"[AX] [{begin} ~ {end}] 구간 요청")

        page = 1
        while True:
            try:
                rows = fetch_page(page, begin, end, KEYWORD)
            except Exception as e:
                print(f"[AX] API 요청 오류 (page {page}): {e}")
                break

            if not rows:
                break

            collected.extend(rows)
            print(f"  [AX] {page}페이지 수신 (누적 {len(collected)}건)")
            page += 1
            time.sleep(0.15)

        chunk_start = chunk_end + timedelta(minutes=1)

    result["total_collected"] = len(collected)
    print(f"[AX] 총 {len(collected)}건 수신")

    if not collected:
        return result

    # 키워드 필터링
    filtered = [
        row for row in collected
        if KEYWORD.lower() in (row.get("bidNtceNm") or "").lower()
    ]
    result["filtered_records"] = len(filtered)
    print(f"[AX] 필터링 후 {len(filtered)}건")

    if not filtered:
        return result

    # 중복 제거 (최신 차수만 유지)
    deduped, orders_to_remove, max_orders, keep_order_keys = select_latest_variants(filtered)

    collected_at = _now_kst()

    # Firestore 적재
    upserted = upsert_firestore(
        deduped, db,
        collected_at=collected_at,
        order_cleanup=orders_to_remove,
        max_orders=max_orders,
        keep_order_keys=keep_order_keys,
    )
    result["upserted_records"] = upserted

    # 이메일용 공고 목록
    result["bid_details"] = [
        {
            "공고명": row.get("bidNtceNm", ""),
            "채권자명": row.get("dminsttNm", "") or row.get("ntceInsttNm", ""),
        }
        for row in deduped
    ]

    # 메타 데이터 업데이트
    if upserted > 0:
        try:
            meta_ref = db.collection(FIREBASE_META_COLLECTION).document(FIREBASE_META_DOC)
            meta_ref.set(
                {
                    "collectedDate": collected_at.date().isoformat(),
                    "collectedAt": collected_at.isoformat(),
                    "upsertedRecords": upserted,
                },
                merge=True,
            )
        except Exception as e:
            print(f"[AX] 메타 데이터 업데이트 실패: {e}")

    print(f"[AX] AX 수집 완료: {upserted}건 업서트")
    return result
