import os
import time
import pandas as pd
import requests
from config import BID_API_KEY, BID_ENDPOINTS, SearchConfig
from scsbid_client import get_scsbid_amount, get_openg_corp_info, get_bid_clsfc_no, get_nobid_reason
from utils import get_output_path

# ✅ 입찰 공고 조회 함수
def fetch_bid_data(endpoint_path, search_config):
    url = f"http://apis.data.go.kr/1230000/ad/BidPublicInfoService/{endpoint_path}?serviceKey={BID_API_KEY}"
    params = {
        "pageNo": 1,
        "numOfRows": 100,
        "inqryDiv": 1,
        "inqryBgnDt": search_config.start_date + "0000",
        "inqryEndDt": search_config.end_date + "2359",
        "type": "json",
        "bidNtceNm": search_config.keyword,
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json().get("response", {}).get("body", {})
    except Exception as e:
        print(f"[입찰공고 조회 오류] {e}")
        return None

# ✅ 입찰 공고 항목 처리
def process_bid_items(items, api_desc, search_config):
    results = []
    if not items:
        return results

    for item in items:
        try:
            bid_name = item.get("bidNtceNm", "")
            if search_config.keyword and search_config.keyword not in bid_name:
                continue

            bid_no = item.get("bidNtceNo", "")
            date = item.get("bidNtceDt", "")
            presmpt_price = int(item.get("presmptPrce", 0))
            vat = int(item.get("VAT", 0))
            total_price = presmpt_price + vat

            results.append({
                "입찰일시": date,
                "공고명": bid_name,
                "채권자명": item.get("crdtrNm", ""),
                "사업금액": total_price,
                "입찰공고번호": bid_no,
                "입찰공고URL": item.get("bidNtceDtlUrl", "")
            })
        except Exception as e:
            print(f"[항목 처리 오류] {e}")
            continue

    return results

# ✅ 실행 메인

def main():
    config = SearchConfig()
    all_data = []

    print("\n📦 입찰 + 개찰 통합 수집을 시작합니다...\n")
    for api in BID_ENDPOINTS:
        response = fetch_bid_data(api["path"], config)
        if response is None:
            continue

        bid_items = process_bid_items(response.get("items", []), api["desc"], config)

        for item in bid_items:
            bid_no = item["입찰공고번호"]
            print(f"📄 처리 중: {bid_no}")

            amount = get_scsbid_amount(bid_no)
            corp_info = get_openg_corp_info(bid_no)

            if not amount:
                clsfc_no = get_bid_clsfc_no(bid_no)
                nobid_reason = get_nobid_reason(bid_no, clsfc_no) if clsfc_no else "bidClsfcNo 없음"
            else:
                nobid_reason = ""

            all_data.append({
                **item,
                "낙찰금액": amount,
                "개찰업체정보": corp_info,
                "유찰사유": nobid_reason
            })

    if all_data:
        df = pd.DataFrame(all_data)
        filename = f"{config.keyword}_입찰+개찰통합_{config.start_date}_{config.end_date}_{time.strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = get_output_path(filename)
        df.to_csv(filepath, index=False, encoding="utf-8-sig")
        print(f"\n✅ 총 {len(df)}건 수집 완료 → {filepath}")
    else:
        print("⚠️ 수집된 데이터가 없습니다.")

if __name__ == "__main__":
    main()