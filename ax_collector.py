"""
AX 키워드 나라장터 공고 수집 → Realtime Database 적재 모듈.

- API 키: BID_API_KEY (config.py에서 공유)
- Firebase: main.py 의 initialize_firebase() 가 띄운 기본 앱(RTDB)을 그대로 쓴다
- 경로: /ax_bids/{공고번호-차수}, /ax_meta/collection_state

Firestore 에서 옮겨온 이유:
  Firestore 는 "문서 읽기 건수"로 과금해 컬렉션을 훑을 때마다 문서 수만큼
  read 가 나간다. 프론트가 전량을 받아 필터하는 구조라 무료 한도를 실제로
  소진시켰다. RTDB 는 전송량 과금이고 이 데이터는 0.3MB 수준이라 부담이 없다.
  클라이언트가 직접 읽을 수 있어 서버 라우트·서비스 계정 키도 필요 없어진다.
"""

import math
import time
from collections import defaultdict
from datetime import datetime, timedelta
from urllib.parse import unquote

import requests
import firebase_admin
from firebase_admin import db as rtdb

from config import BID_API_KEY

# ── 상수 ──────────────────────────────────────────────
BASE_URL = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch"
KEYWORD = "AX"
ROWS_PER_PAGE = 50
DATE_FMT = "%Y%m%d%H%M"
CHUNK_DAYS = 3
RTDB_PATH = "/ax_bids"
RTDB_META_PATH = "/ax_meta/collection_state"


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


# ── RTDB 초기화 ────────────────────────────────────────
def init_rtdb():
    """RTDB 기본 앱 확인. main.py 가 이미 초기화했으면 그대로 쓴다.

    이전에는 별도 Firebase 프로젝트(g2b-bid-finder)의 서비스 계정을 쓰느라
    private_key 의 중복 base64 구간을 잘라내는 우회 코드까지 있었다.
    RTDB 기본 앱으로 통일하면서 그 전부가 필요 없어졌다.
    """
    try:
        firebase_admin.get_app()
    except ValueError:
        from main import initialize_firebase
        initialize_firebase()
    print("[AX] RTDB 사용 준비 완료")


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


# ── RTDB 헬퍼 ─────────────────────────────────────────
def get_latest_bid_datetime() -> datetime | None:
    """RTDB 에서 가장 최근 공고일시를 조회.

    수백 건 규모라 전체를 읽고 최댓값을 취한다. 색인을 두지 않아도 된다.
    """
    node = rtdb.reference(RTDB_PATH).get() or {}
    latest = None
    for rec in node.values():
        raw = (rec or {}).get("bidNtceDt")
        if not isinstance(raw, str):
            continue
        try:
            dt = datetime.fromisoformat(raw.replace(" ", "T"))
        except ValueError:
            continue
        if latest is None or dt > latest:
            latest = dt
    return latest


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


def _safe_key(raw: str) -> str:
    """RTDB 키에 쓸 수 없는 문자(. $ # [ ] /)를 치환한다."""
    out = str(raw)
    for ch in ".$#[]/":
        out = out.replace(ch, "_")
    return out


def normalize_record(record: dict) -> dict:
    """RTDB에 저장 가능한 형태로 정규화."""
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


def upsert_rtdb(records: list[dict], *, collected_at=None, order_cleanup=None) -> int:
    """RTDB 에 업서트. 키는 Firestore 시절과 동일한 '공고번호-차수'."""
    if not records:
        print("[AX] RTDB에 적재할 데이터가 없습니다.")
        return 0

    collected_at_iso = _ensure_kst(collected_at or _now_kst()).isoformat()
    payload = {}

    for idx, record in enumerate(records, start=1):
        normalized = normalize_record(record)
        normalized["collectedAt"] = collected_at_iso
        doc_id = f"{normalized.get('bidNtceNo', '')}-{normalized.get('bidNtceOrd', '')}".strip("-")
        if not doc_id:
            doc_id = normalized.get("untyNtceNo") or f"auto-{idx}"
        payload[_safe_key(doc_id)] = normalized

    ref = rtdb.reference(RTDB_PATH)
    ref.update(payload)   # 증분 수집이므로 기존 건은 남긴다
    print(f"[AX] RTDB 적재 완료: 총 {len(payload)}건 → {RTDB_PATH}")

    # 같은 공고의 이전 차수 문서 제거
    if order_cleanup:
        for base_no, orders in order_cleanup.items():
            for order_key in orders:
                doc_id = _safe_key(f"{base_no}-{order_key}".strip("-"))
                if not doc_id:
                    continue
                try:
                    ref.child(doc_id).delete()
                    print(f"  [AX] 이전 차수 삭제: {doc_id}")
                except Exception as exc:
                    print(f"  [AX] 삭제 실패 {doc_id}: {exc}")

    return len(payload)


# ── 메인 수집 함수 ────────────────────────────────────
def collect_ax_data() -> dict:
    """
    AX 키워드 공고를 수집하여 RTDB(/ax_bids)에 적재.

    Returns:
        dict: {
            "keyword": "AX",
            "total_collected": int,    # API에서 수신한 총 건수
            "filtered_records": int,   # 키워드 필터 후 건수
            "upserted_records": int,   # RTDB에 적재된 건수
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
    print(f"🎯 [AX] AX 키워드 RTDB 수집 시작")
    print(f"{'='*50}")

    # RTDB 준비
    try:
        init_rtdb()
    except Exception as e:
        print(f"[AX] RTDB 초기화 실패: {e}")
        print("[AX] AX 수집을 건너뜁니다.")
        return result

    # 수집 기간 계산 (RTDB 최신 데이터 기준 증분 수집)
    try:
        from zoneinfo import ZoneInfo
        KST = ZoneInfo("Asia/Seoul")
        default_start = datetime(2025, 1, 1, tzinfo=KST)
    except Exception:
        default_start = datetime(2025, 1, 1)

    end_dt = _now_kst().replace(second=0, microsecond=0)
    start_dt = default_start

    try:
        latest_dt = get_latest_bid_datetime()
        if latest_dt:
            latest_dt = _ensure_kst(latest_dt)
            candidate = latest_dt + timedelta(seconds=1)
            if candidate <= end_dt:
                start_dt = candidate
                print(f"[AX] RTDB 최신 공고일시: {latest_dt.isoformat()} → {start_dt.isoformat()}부터 수집")
            else:
                print("[AX] 이미 최신 데이터가 수집되어 있습니다.")
                return result
        else:
            print("[AX] RTDB에 기존 데이터 없음. 기본 시작일(2025-01-01) 사용.")
    except Exception as exc:
        print(f"[AX] RTDB 최신 데이터 조회 실패: {exc}")
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

    # RTDB 적재
    upserted = upsert_rtdb(
        deduped,
        collected_at=collected_at,
        order_cleanup=orders_to_remove,
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
            rtdb.reference(RTDB_META_PATH).update({
                "collectedDate": collected_at.date().isoformat(),
                "collectedAt": collected_at.isoformat(),
                "upsertedRecords": upserted,
            })
        except Exception as e:
            print(f"[AX] 메타 데이터 업데이트 실패: {e}")

    print(f"[AX] AX 수집 완료: {upserted}건 업서트")
    return result
