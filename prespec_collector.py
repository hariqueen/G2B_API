"""
사전규격 / 발주계획 나라장터 공고 수집 → Firestore (g2b-bid-finder) 적재 모듈.

- API 키: BID_API_KEY (config.py에서 공유. 입찰공고 수집과 동일 키)
- Firebase: ax_collector 의 init_firestore() 재사용 (앱 'ax_firestore')
- 컬렉션: pre_spec_list (사전규격) / order_plan_list (발주계획)

기획 근거: 기획_사전규격_대시보드_반영.md
API 스펙: 조달청API_발주계획_사전규격_스펙.md
"""

import re
import time
from datetime import datetime, timedelta
from urllib.parse import unquote

import requests

from config import BID_API_KEY

# ── 상수 ──────────────────────────────────────────────
# 반드시 https. http(80포트)는 무응답으로 타임아웃 발생.
SPEC_URL = ("https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService"
            "/getPublicPrcureThngInfoServcPPSSrch")
PLAN_URL = ("https://apis.data.go.kr/1230000/ao/OrderPlanSttusService"
            "/getOrderPlanSttusListServcPPSSrch")

SPEC_COLLECTION = "pre_spec_list"
PLAN_COLLECTION = "order_plan_list"

# 대시보드 도메인 구분. 콜센터 키워드는 RTDB /search_keywords 에서 받아 쓰고,
# AX/BPR/ISP 는 여기에 고정한다 (AX 탭이 이 세 가지를 묶어 부른다).
DOMAIN_CALLCENTER = "callcenter"
DOMAIN_AX = "ax"
AX_KEYWORDS = ["AX", "BPR", "ISP"]

# 영문 약어는 API 가 부분일치로 잡아 Axial / Maxwell / Taxonomy / AXIS 같은
# 오탐이 섞인다(실측 173건 중 14건, 8%). 단어 경계로 다시 거른다.
_ACRONYM_RE = {
    kw: re.compile(rf"(?<![A-Za-z]){kw}(?![A-Za-z])", re.I) for kw in AX_KEYWORDS
}

ROWS_PER_PAGE = 999          # 999까지 정상 동작 확인
MAX_RANGE_DAYS = 365         # 366일부터 resultCode 07 (입력범위값 초과)
LOOKBACK_DAYS = 365
REQUEST_TIMEOUT = 30
RETRY = 3


# ── 시간 유틸 ─────────────────────────────────────────
def _now_kst() -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Asia/Seoul"))
    except Exception:
        return datetime.now()


# ── API 공통 ──────────────────────────────────────────
def _parse_body(payload: dict) -> dict:
    """정상/에러 응답의 최상위 키가 다르다.

    정상        : response
    파라미터 오류: nkoneps.com.response.ResponseError
    인증 실패    : OpenAPI_ServiceResponse
    """
    if "response" in payload:
        header = payload["response"].get("header") or {}
        if header.get("resultCode") not in ("00", None):
            raise RuntimeError(f"{header.get('resultCode')} {header.get('resultMsg')}")
        return payload["response"].get("body") or {}

    root = next(iter(payload), "")
    node = payload.get(root) or {}
    head = node.get("header") or node.get("cmmMsgHeader") or {}
    raise RuntimeError(f"{root}: {head}")


def _items(body: dict) -> list[dict]:
    it = body.get("items") or []
    if isinstance(it, dict):      # 1건이면 dict로 내려온다
        return [it]
    return it


def _fetch(url: str, params: dict) -> dict:
    last = None
    for attempt in range(RETRY):
        try:
            r = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            return _parse_body(r.json())
        except Exception as exc:
            last = exc
            if attempt < RETRY - 1:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"API 호출 실패: {last}")


def norm_bid_no(raw: str) -> str:
    """입찰공고번호 정규화. 서비스마다 형식이 달라 반드시 거쳐야 한다.

    사전규격  R25BK01024415      (13자, 공고번호만)          → 그대로
    발주계획  R26BK01648198000   (16자, 공고번호+차수 3자)    → 뒤 3자 제거
    Firestore R26BK01649424-000  (하이픈 구분)               → 앞부분만
    """
    n = (raw or "").strip()
    if not n:
        return ""
    if len(n) == 16 and n[-3:].isdigit():
        return n[:-3]
    return n.split("-")[0]


def split_bid_nos(raw: str) -> list[str]:
    """bidNtceNoList(콤마 구분)를 정규화된 공고번호 리스트로."""
    out = []
    for part in (raw or "").split(","):
        n = norm_bid_no(part)
        if n and n not in out:
            out.append(n)
    return out


# ── 수집 ──────────────────────────────────────────────
def _collect(url: str, keyword_param: str, keyword: str, extra: dict) -> list[dict]:
    """키워드 1건에 대한 전체 페이지 수집."""
    end = _now_kst().replace(second=0, microsecond=0)
    begin = end - timedelta(days=min(LOOKBACK_DAYS, MAX_RANGE_DAYS))

    params = {
        "ServiceKey": unquote(BID_API_KEY or "").strip(),
        "type": "json",
        "pageNo": 1,
        "numOfRows": ROWS_PER_PAGE,
        "inqryBgnDt": begin.strftime("%Y%m%d%H%M"),
        "inqryEndDt": end.strftime("%Y%m%d%H%M"),
        keyword_param: keyword,
    }
    params.update(extra)

    rows, page = [], 1
    while True:
        params["pageNo"] = page
        body = _fetch(url, params)
        batch = _items(body)
        rows.extend(batch)

        total = int(body.get("totalCount") or 0)
        if len(rows) >= total or not batch:
            break
        page += 1
        if page > 20:                     # 안전장치
            print(f"    ! 페이지 20 초과, 중단 (keyword={keyword})")
            break
    return rows


def _keep(kw: str, title: str) -> bool:
    """영문 약어 키워드는 단어 경계로 재검증한다. 한글 키워드는 그대로 통과."""
    rx = _ACRONYM_RE.get(kw.upper())
    return True if rx is None else bool(rx.search(title or ""))


def fetch_pre_specs(targets: list[tuple[str, str]]) -> dict[str, dict]:
    """사전규격. 키 = bfSpecRgstNo. targets = [(키워드, 도메인), ...]"""
    uniq: dict[str, dict] = {}
    for kw, domain in targets:
        try:
            rows = _collect(SPEC_URL, "prdctClsfcNoNm", kw, {"inqryDiv": "1"})
        except Exception as exc:
            print(f"  [사전규격] '{kw}' 수집 실패: {exc}")
            continue
        kept = 0
        for r in rows:
            key = (r.get("bfSpecRgstNo") or "").strip()
            if not key or not _keep(kw, r.get("prdctClsfcNoNm")):
                continue
            kept += 1
            hit = uniq.setdefault(key, r)
            hit.setdefault("_keywords", [])
            hit.setdefault("_domains", [])
            if kw not in hit["_keywords"]:
                hit["_keywords"].append(kw)
            if domain not in hit["_domains"]:
                hit["_domains"].append(domain)
        drop = len(rows) - kept
        print(f"  [사전규격][{domain}] '{kw}': {kept}건" + (f" (오탐 {drop}건 제외)" if drop else ""))
    return uniq


def fetch_order_plans(targets: list[tuple[str, str]]) -> dict[str, dict]:
    """발주계획. 키 = orderPlanUntyNo. targets = [(키워드, 도메인), ...]"""
    now = _now_kst()
    uniq: dict[str, dict] = {}
    for kw, domain in targets:
        try:
            rows = _collect(PLAN_URL, "bizNm", kw, {
                "orderBgnYm": f"{now.year - 1}01",
                "orderEndYm": f"{now.year + 1}12",
            })
        except Exception as exc:
            print(f"  [발주계획] '{kw}' 수집 실패: {exc}")
            continue
        kept = 0
        for r in rows:
            key = (r.get("orderPlanUntyNo") or "").strip()
            if not key or not _keep(kw, r.get("bizNm")):
                continue
            kept += 1
            hit = uniq.setdefault(key, r)
            hit.setdefault("_keywords", [])
            hit.setdefault("_domains", [])
            if kw not in hit["_keywords"]:
                hit["_keywords"].append(kw)
            if domain not in hit["_domains"]:
                hit["_domains"].append(domain)
        drop = len(rows) - kept
        print(f"  [발주계획][{domain}] '{kw}': {kept}건" + (f" (오탐 {drop}건 제외)" if drop else ""))
    return uniq


# ── 정규화 / 적재 ─────────────────────────────────────
def _normalize(record: dict, source: str) -> dict:
    out = {}
    for k, v in record.items():
        out[k] = v.isoformat() if isinstance(v, datetime) else v

    out["_source"] = source
    out["_domains"] = record.get("_domains") or []
    out["bidNtceNos"] = split_bid_nos(record.get("bidNtceNoList"))
    out["collectedAt"] = _now_kst().isoformat()

    if source == "pre_spec":
        out["specDocUrls"] = [
            record.get(f"specDocFileUrl{i}") for i in range(1, 6)
            if (record.get(f"specDocFileUrl{i}") or "").strip()
        ]
    return out


def upsert(db, collection: str, records: dict[str, dict], source: str) -> int:
    if not records:
        print(f"  [{source}] 적재할 데이터가 없습니다.")
        return 0

    batch = db.batch()
    n = 0
    for doc_id, rec in records.items():
        batch.set(db.collection(collection).document(doc_id),
                  _normalize(rec, source), merge=True)
        n += 1
        if n % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.commit()
    print(f"  [{source}] Firestore 적재 완료: {n}건 → {collection}")
    return n


# ── 의견마감 임박 추출 ────────────────────────────────
def imminent_opinions(specs: dict[str, dict], days: int = 3) -> list[dict]:
    """의견등록 마감이 days일 이내로 남은 건. 메일 알림용.

    의견수렴 기간이 중앙값 5일로 짧아 상시 3~4건 수준이다.
    """
    now = _now_kst().replace(tzinfo=None)
    out = []
    for s in specs.values():
        raw = (s.get("opninRgstClseDt") or "").strip()
        if not raw:
            continue
        try:
            close = datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        remain = (close - now).days
        if 0 <= remain <= days:
            try:
                eok = round(int(s.get("asignBdgtAmt") or 0) / 100_000_000, 1)
            except (TypeError, ValueError):
                eok = 0.0
            # 키를 ASCII로 둔다. 워크플로의 jq가 한글 키에는 .["품명"] 형식을 요구해
            # 표현식이 장황해지고 따옴표 중첩으로 깨지기 쉽다.
            out.append({
                "title": s.get("prdctClsfcNoNm", ""),
                "institution": s.get("orderInsttNm", ""),
                "amountEok": eok,
                "deadline": raw,
                "dday": remain,
                "docUrl": (s.get("specDocFileUrl1") or ""),
            })
    return sorted(out, key=lambda x: x["dday"])


# ── 메인 ──────────────────────────────────────────────
def collect_prespec_data(keywords: list[str]) -> dict:
    """사전규격 + 발주계획을 수집해 Firestore에 적재한다.

    Returns:
        dict: {
            "pre_spec_count": int,      # 적재된 사전규격 건수
            "order_plan_count": int,    # 적재된 발주계획 건수
            "imminent": list[dict],     # 의견마감 D-3 이내 (메일용)
        }
    """
    result = {"pre_spec_count": 0, "order_plan_count": 0, "imminent": []}

    if not BID_API_KEY:
        print("[사전규격] BID_API_KEY 없음. 수집을 건너뜁니다.")
        return result
    if not keywords:
        print("[사전규격] 키워드가 비어 있습니다. 수집을 건너뜁니다.")
        return result

    print(f"\n{'='*50}")
    print("🎯 [사전규격/발주계획] Firestore 수집 시작")
    print(f"{'='*50}")

    try:
        from ax_collector import init_firestore
        db = init_firestore()
    except Exception as exc:
        print(f"[사전규격] Firestore 초기화 실패: {exc}. 수집을 건너뜁니다.")
        return result

    # 콜센터 도메인은 대시보드 설정 탭(RTDB)에서 관리하는 키워드,
    # AX 도메인은 AX/BPR/ISP 고정. 한 건이 양쪽에 걸릴 수 있어 _domains 는 배열이다.
    targets = ([(kw, DOMAIN_CALLCENTER) for kw in keywords]
               + [(kw, DOMAIN_AX) for kw in AX_KEYWORDS])

    specs = fetch_pre_specs(targets)
    print(f"  [사전규격] 고유 {len(specs)}건")
    plans = fetch_order_plans(targets)
    print(f"  [발주계획] 고유 {len(plans)}건")

    try:
        result["pre_spec_count"] = upsert(db, SPEC_COLLECTION, specs, "pre_spec")
        result["order_plan_count"] = upsert(db, PLAN_COLLECTION, plans, "order_plan")
    except Exception as exc:
        print(f"[사전규격] Firestore 적재 실패: {exc}")

    result["imminent"] = imminent_opinions(specs, days=3)
    print(f"  [사전규격] 의견마감 D-3 이내: {len(result['imminent'])}건")

    return result


if __name__ == "__main__":
    from config import SEARCH_KEYWORDS
    print(collect_prespec_data(list(SEARCH_KEYWORDS)))
