import time
from config import BID_ENDPOINTS, SearchConfig, DEFAULT_INPUT, SEARCH_KEYWORDS, _now_kst
from data_processor import fetch_bid_data, process_bid_items
from scsbid_client import get_scsbid_amount, get_openg_corp_info, get_bid_clsfc_no, get_nobid_reason
import firebase_admin
from firebase_admin import credentials
from firebase_admin import db
from datetime import datetime

# Firebase 초기화 함수
def initialize_firebase():
    try:
        firebase_admin.get_app()
    except ValueError:
        import os
        import json
        
        # 환경 변수에서 Firebase 인증 정보 가져오기
        firebase_credentials = os.environ.get('FIREBASE_CREDENTIALS')
        
        if firebase_credentials:
            # 환경 변수에 저장된 JSON 문자열을 딕셔너리로 변환
            cred_dict = json.loads(firebase_credentials)
            cred = credentials.Certificate(cred_dict)
        else:
            # 로컬 개발 환경일 경우 파일 사용
            try:
                cred = credentials.Certificate('g2b-db-6aae9-firebase-adminsdk-fbsvc-0e3b1ce560.json')
            except FileNotFoundError:
                print("Firebase 인증 파일을 찾을 수 없습니다.")
                raise
                
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/'
        })
    print("Firebase 초기화 완료")

# Firebase에 데이터 업로드 함수
def upload_to_firebase(data_items):
    if not data_items:
        print("업로드할 데이터가 없습니다.")
        return
    
    print(f"\n🔄 Firebase에 {len(data_items)}건의 데이터 업로드 시작...")
    
    # Firebase 초기화
    initialize_firebase()
    
    # 기준 경로 설정
    bids_ref = db.reference('/bids')
    user_inputs_ref = db.reference('/user_inputs')
    
    # 업로드 카운터
    uploaded_count = 0
    updated_count = 0
    skipped_count = 0
    user_inputs_created = 0
    
    for item in data_items:
        try:
            # 입찰일시 파싱
            bid_date = datetime.strptime(item["입찰일시"], "%Y-%m-%d %H:%M:%S")
            year = str(bid_date.year)
            month = f"{bid_date.month:02d}"  # 두 자리 숫자로 포맷팅
            
            # 입찰공고번호를 key로 사용 (없으면 타임스탬프 기반으로 생성)
            bid_id = item.get("입찰공고번호", "")
            if not bid_id:
                bid_id = f"bid_{int(time.time())}_{uploaded_count}"
            
            # 해당 연도와 월 경로 참조
            year_month_ref = bids_ref.child(year).child(month)
            
            # 데이터 정리 - API에서 가져온 9개 필드 저장
            firebase_data = {
                "입찰일시": item.get("입찰일시", ""),
                "공고명": item.get("공고명", ""),
                "채권자명": item.get("채권자명", ""),
                "사업금액": item.get("사업금액", 0),
                "입찰공고번호": item.get("입찰공고번호", ""),
                "낙찰금액": item.get("낙찰금액", 0),
                "개찰업체정보": item.get("개찰업체정보", ""),
                "유찰사유": item.get("유찰사유", ""),
                "입찰공고URL": item.get("입찰공고URL", "")
            }
            
            # 중복 확인을 위해 해당 연도/월의 모든 데이터 가져오기
            month_data = year_month_ref.get() or {}
            
            # 중복 플래그
            is_duplicate = False
            
            # 중복 확인: 입찰일시와 공고명이 동일한 항목 체크
            for existing_id, existing_item in month_data.items():
                if (existing_item.get("입찰일시") == firebase_data["입찰일시"] and 
                    existing_item.get("공고명") == firebase_data["공고명"]):
                    # 중복 발견 - 이미 있는 데이터 ID 사용
                    bid_id = existing_id
                    is_duplicate = True
                    break
            
            if is_duplicate:
                # 중복 데이터 - 업데이트 여부 결정
                # 추가 필드가 더 많은 정보를 가지고 있으면 업데이트
                existing_data = month_data[bid_id]
                should_update = False
                
                # 기존 데이터에 비어있는 값이 있고, 새 데이터에는 값이 있으면 업데이트
                if (not existing_data.get("낙찰금액") and firebase_data["낙찰금액"]) or \
                   (not existing_data.get("개찰업체정보") and firebase_data["개찰업체정보"]) or \
                   (not existing_data.get("유찰사유") and firebase_data["유찰사유"]):
                    should_update = True
                
                if should_update:
                    year_month_ref.child(bid_id).update(firebase_data)
                    updated_count += 1
                    print(f"🔄 업데이트: {bid_id} - {firebase_data['공고명']} ({year}-{month})")
                else:
                    skipped_count += 1
                    print(f"⏭️ 건너뜀 (중복): {bid_id} - {firebase_data['공고명']} ({year}-{month})")
            else:
                # 새로운 데이터 - 추가
                year_month_ref.child(bid_id).set(firebase_data)
                uploaded_count += 1
                print(f"➕ 추가: {bid_id} - {firebase_data['공고명']} ({year}-{month})")
            
            # user_inputs에 데이터가 있는지 확인하고 없으면 생성
            user_input_data = user_inputs_ref.child(bid_id).get()
            if not user_input_data:
                # user_inputs 데이터 생성
                user_inputs_ref.child(bid_id).set({
                    "물동량 평균": 0,
                    "용역기간(개월)": 0,
                    "마지막_수정일": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    "수정자": "system_auto"
                })
                user_inputs_created += 1
                print(f"🆕 user_inputs 생성: {bid_id}")
                
        except Exception as e:
            print(f"⚠️ Firebase 업로드 중 오류 발생: {e}")
            continue
    
    print(f"\n✅ Firebase 업로드 완료: {uploaded_count}건 추가, {updated_count}건 업데이트, {skipped_count}건 건너뜀")
    print(f"✅ user_inputs {user_inputs_created}건 생성")


# 기존 bid_id들에 대한 user_inputs 생성 함수
def create_missing_user_inputs():
    print("\n🔄 기존 데이터에 대한 user_inputs 생성 시작...")
    
    # Firebase 초기화
    initialize_firebase()
    
    # 기준 경로 설정
    bids_ref = db.reference('/bids')
    user_inputs_ref = db.reference('/user_inputs')
    
    # 현재 user_inputs 키 목록 가져오기
    existing_user_inputs = user_inputs_ref.get() or {}
    existing_keys = set(existing_user_inputs.keys())
    
    created_count = 0
    existing_count = 0
    
    # 모든 연도 순회
    years = bids_ref.get() or {}
    for year, months in years.items():
        for month, bids in months.items():
            for bid_id, bid_data in bids.items():
                # 이미 user_inputs에 있는지 확인
                if bid_id in existing_keys:
                    existing_count += 1
                    continue
                
                # user_inputs 데이터 생성
                user_inputs_ref.child(bid_id).set({
                    "물동량 평균": 0,
                    "용역기간(개월)": 0,
                    "마지막_수정일": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    "수정자": "system_auto"
                })
                created_count += 1
                
                # 진행 상황 출력 (100개마다)
                if created_count % 100 == 0:
                    print(f"🔄 {created_count}건 처리 중...")
    
    print(f"✅ user_inputs 생성 완료: {created_count}건 생성, {existing_count}건 이미 존재")


def print_execution_time(start_time):
    end_time = time.time()
    execution_time = end_time - start_time
    print(f"실행 시간: {execution_time:.2f}초")

# 개찰업체정보 정리 함수 추가
def clean_company_info(info):
    """개찰업체정보에서 ^ 이후 부분을 제거"""
    if not info or not isinstance(info, str):
        return ""
    
    # ^가 있으면 첫 번째 ^까지만 반환
    if '^' in info:
        return info.split('^')[0]
    
    return info

# 🔄 단일 키워드 처리 함수
def process_single_keyword(keyword):
    """단일 키워드에 대한 데이터 수집 및 처리"""
    print(f"\n🎯 키워드 '{keyword}' 수집 시작...")
    
    config = SearchConfig(keyword=keyword)
    keyword_data = []

    for api in BID_ENDPOINTS:
        try:
            response = fetch_bid_data(api["path"], config)
            if response is None:
                continue

            bid_items = process_bid_items(response.get("items", []), api["desc"], config)

            for item in bid_items:
                bid_no = item["입찰공고번호"]
                print(f"📄 처리 중: {bid_no}")

                amount = get_scsbid_amount(bid_no)
                corp_info = get_openg_corp_info(bid_no)
                clean_corp_info = clean_company_info(corp_info)

                if not amount:
                    clsfc_no = get_bid_clsfc_no(bid_no)
                    nobid_reason = get_nobid_reason(bid_no, clsfc_no) if clsfc_no else "bidClsfcNo 없음"
                else:
                    nobid_reason = ""

                keyword_data.append({
                    **item,
                    "낙찰금액": amount,
                    "개찰업체정보": clean_corp_info,
                    "유찰사유": nobid_reason
                })

        except Exception as e:
            # 인증/권한 문제는 계속 0건으로 누적되므로 즉시 실패로 올린다.
            if isinstance(e, RuntimeError) and str(e).startswith("G2B_AUTH_ERROR"):
                raise
            print(f"[{api['desc']}] 키워드 '{keyword}' 데이터 수집 중 오류 발생: {e}")
            print(f"[{api['desc']}] 다음 API로 이동합니다.")

    print(f"키워드 '{keyword}' 수집 완료: {len(keyword_data)}건")
    return keyword_data

def main():
    start_time = time.time()

    # 전체 수집 데이터 저장
    all_collected_data = []
    keyword_results = {}
    keyword_bid_details = {}  # 키워드별 공고 목록 (팝업용)

    print("\n📦 다중 키워드 입찰 + 개찰 통합 수집을 시작합니다...")
    print(f"검색 조건: 기간 {DEFAULT_INPUT['start_date']} ~ {DEFAULT_INPUT['end_date']}")
    print(f"검색 키워드: {', '.join(SEARCH_KEYWORDS)}")
    print("※ 용역 카테고리만 수집합니다.")

    # 🔄 각 키워드별로 순차 처리
    for i, keyword in enumerate(SEARCH_KEYWORDS, 1):
        print(f"\n{'='*50}")
        print(f"🎯 [{i}/{len(SEARCH_KEYWORDS)}] 키워드: '{keyword}' 처리 중...")
        print(f"{'='*50}")
        
        try:
            keyword_data = process_single_keyword(keyword)
            
            # 키워드별 결과 저장
            keyword_results[keyword] = len(keyword_data)
            
            # 키워드별 공고 목록 저장
            keyword_bid_details[keyword] = [
                {"공고명": item["공고명"], "채권자명": item["채권자명"]}
                for item in keyword_data
            ]
            
            # 전체 데이터에 추가
            all_collected_data.extend(keyword_data)
            
            print(f"✅ 키워드 '{keyword}' 완료: {len(keyword_data)}건 수집")
            
            if keyword_data:
                # 키워드별로 Firebase에 즉시 업로드
                upload_to_firebase(keyword_data)
        except Exception as e:
            # 인증/권한 문제는 더 진행해도 의미 없으므로 즉시 실패 처리
            if isinstance(e, RuntimeError) and str(e).startswith("G2B_AUTH_ERROR"):
                raise
            print(f"❌ 키워드 '{keyword}' 처리 중 오류: {e}")
            keyword_results[keyword] = 0

    # ── AX 키워드 Firestore 수집 ──────────────────────────
    ax_result = {"keyword": "AX", "total_collected": 0, "upserted_records": 0, "bid_details": []}
    try:
        from ax_collector import collect_ax_data
        ax_result = collect_ax_data()
        keyword_results["AX"] = ax_result["upserted_records"]
    except Exception as e:
        print(f"❌ AX Firestore 수집 중 오류: {e}")
        keyword_results["AX"] = 0

    # 🎉 최종 결과 출력
    print(f"\n{'='*50}")
    print("🎉 전체 키워드 수집 완료!")
    print(f"{'='*50}")
    
    total_count = len(all_collected_data)
    print(f"📊 총 수집 데이터 (RTDB): {total_count}건")
    print(f"📊 AX 수집 데이터 (Firestore): {ax_result['upserted_records']}건 업서트")
    
    print("\n📈 키워드별 수집 현황:")
    for keyword, count in keyword_results.items():
        print(f"  • {keyword}: {count}건")

    import json

    # AX 키워드별 공고 목록도 추가
    keyword_bid_details["AX"] = ax_result.get("bid_details", [])

    # 결과 정보를 파일로 저장 (GitHub Actions에서 읽기 위해)
    result_info = {
        "total_count": total_count,
        "collection_date": _now_kst().strftime('%Y-%m-%d %H:%M:%S'),
        "keyword_results": keyword_results,
        "keywords": SEARCH_KEYWORDS,
        "keyword_bid_details": keyword_bid_details,
        "bid_details": [
            {
                "공고명": item["공고명"],
                "채권자명": item["채권자명"]
            } for item in all_collected_data
        ],
        "ax_result": {
            "upserted_records": ax_result["upserted_records"],
            "total_collected": ax_result["total_collected"],
            "filtered_records": ax_result.get("filtered_records", 0),
        },
        "ax_bid_details": ax_result.get("bid_details", []),
    }

    # G2B_API 폴더에 저장 (GitHub Actions 이메일 알림용)
    with open('collection_result.json', 'w', encoding='utf-8') as f:
        json.dump(result_info, f, ensure_ascii=False, indent=2)
    
    # Firebase RTDB에 수집 결과 저장 (프론트엔드에서 실시간 조회)
    try:
        initialize_firebase()
        collection_ref = db.reference('/collection_results/latest')
        collection_ref.set(result_info)
        print("✅ 수집 결과를 Firebase RTDB /collection_results/latest 에 저장했습니다.")
    except Exception as e:
        print(f"⚠️ Firebase RTDB에 수집 결과 저장 실패 (무시하고 계속): {e}")

    if all_collected_data:
        # 기존 데이터에 대한 user_inputs 생성
        create_missing_user_inputs()
    else:
        print("⚠️ RTDB 수집된 데이터가 없습니다. (AX는 별도 확인)")

    print_execution_time(start_time)

if __name__ == "__main__":
    main()