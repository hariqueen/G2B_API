import requests
from config import BID_API_KEY

# ✅ 낙찰금액 조회 (inqryDiv=4, bidNtceNo 기반)
def get_scsbid_amount(bidNtceNo):
    url = f"http://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusServc?serviceKey={BID_API_KEY}"
    params = {
        "pageNo": 1,
        "numOfRows": 1,
        "inqryDiv": 4,
        "type": "json",
        "bidNtceNo": bidNtceNo,
        "inqryBgnDt": "202401010000",
        "inqryEndDt": "202512312359"
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        item = response.json().get("response", {}).get("body", {}).get("items", [{}])[0]
        return item.get("sucsfbidAmt", "")
    except Exception as e:
        print(f"[낙찰금액 조회 오류] {bidNtceNo}: {e}")
        return None

# ✅ 개찰업체 정보 조회 (inqryDiv=3)
def get_openg_corp_info(bidNtceNo):
    url = f"http://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoServcPPSSrch?serviceKey={BID_API_KEY}"
    params = {
        "pageNo": 1,
        "numOfRows": 1,
        "inqryDiv": 3,
        "type": "json",
        "bidNtceNo": bidNtceNo,
        "inqryBgnDt": "202401010000",
        "inqryEndDt": "202512312359"
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        item = response.json().get("response", {}).get("body", {}).get("items", [{}])[0]
        return item.get("opengCorpInfo", "")
    except Exception as e:
        print(f"[개찰업체 조회 오류] {bidNtceNo}: {e}")
        return None

# ✅ bidClsfcNo 조회 (유찰 사유 조회 전 단계)
def get_bid_clsfc_no(bidNtceNo):
    url = f"http://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoServcPPSSrch?serviceKey={BID_API_KEY}"
    params = {
        "pageNo": 1,
        "numOfRows": 1,
        "inqryDiv": 3,
        "type": "json",
        "bidNtceNo": bidNtceNo,
        "inqryBgnDt": "202401010000",
        "inqryEndDt": "202512312359"
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        item = response.json().get("response", {}).get("body", {}).get("items", [{}])[0]
        return item.get("bidClsfcNo", "")
    except Exception as e:
        print(f"[bidClsfcNo 조회 오류] {bidNtceNo}: {e}")
        return None

# ✅ 유찰사유 조회 (bidNtceNo + bidClsfcNo)
def get_nobid_reason(bidNtceNo, bidClsfcNo):
    url = f"http://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoFailing?serviceKey={BID_API_KEY}"
    params = {
        "pageNo": 1,
        "numOfRows": 1,
        "type": "json",
        "bidNtceNo": bidNtceNo,
        "bidClsfcNo": bidClsfcNo,
        "inqryBgnDt": "202401010000",
        "inqryEndDt": "202512312359"
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        item = response.json().get("response", {}).get("body", {}).get("items", [{}])[0]
        return item.get("nobidRsn", "")
    except Exception as e:
        print(f"[유찰사유 조회 오류] {bidNtceNo}: {e}")
        return None
