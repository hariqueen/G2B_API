import firebase_admin
from firebase_admin import credentials
from firebase_admin import db
from datetime import datetime
import json

# Firebase 초기화 함수
def initialize_firebase():
    try:
        firebase_admin.get_app()
        print("✅ Firebase 이미 초기화됨")
    except ValueError:
        try:
            cred = credentials.Certificate('g2b-db-6aae9-firebase-adminsdk-fbsvc-0e3b1ce560.json')
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/'
            })
            print("✅ Firebase 초기화 완료")
        except FileNotFoundError:
            print("❌ Firebase 인증 파일을 찾을 수 없습니다.")
            raise

def delete_recent_collection_data():
    """방금 수집한 데이터들을 삭제하는 함수"""
    
    print("🗑️ 최근 수집 데이터 삭제를 시작합니다...")
    
    # Firebase 초기화
    initialize_firebase()
    
    # collection_result.json에서 방금 수집한 데이터 정보 읽기
    try:
        with open('collection_result.json', 'r', encoding='utf-8') as f:
            result_data = json.load(f)
            
        print(f"📄 collection_result.json 로드 완료")
        print(f"📊 삭제 대상: {result_data['total_count']}건")
        print(f"📅 수집 시간: {result_data['collection_date']}")
        
        # 키워드별 현황 출력
        print("\n🎯 키워드별 삭제 대상:")
        for keyword, count in result_data['keyword_results'].items():
            print(f"  • {keyword}: {count}건")
            
    except FileNotFoundError:
        print("❌ collection_result.json 파일을 찾을 수 없습니다.")
        print("💡 수동으로 삭제할 입찰공고번호들을 입력해주세요.")
        return manual_delete()
    
    # 사용자 확인
    print(f"\n⚠️ 위 데이터들을 정말로 삭제하시겠습니까?")
    print("⚠️ 이 작업은 되돌릴 수 없습니다!")
    confirm = input("삭제하려면 'DELETE'를 입력하세요: ")
    
    if confirm != 'DELETE':
        print("❌ 삭제가 취소되었습니다.")
        return
    
    # Firebase 참조
    bids_ref = db.reference('/bids')
    user_inputs_ref = db.reference('/user_inputs')
    
    deleted_bids = 0
    deleted_user_inputs = 0
    failed_deletes = []
    
    # bid_details에서 입찰공고번호 추출하여 삭제
    for detail in result_data.get('bid_details', []):
        # 입찰공고번호는 공고명에서 추출하거나 별도로 저장되어야 함
        # 일단 2025-05 월에서 해당 공고명으로 검색해서 삭제
        try:
            # 2025년 5월 데이터에서 검색
            may_data = bids_ref.child('2025').child('05').get() or {}
            
            for bid_id, bid_info in may_data.items():
                if (bid_info.get('공고명') == detail['공고명'] and 
                    bid_info.get('채권자명') == detail['채권자명']):
                    
                    # bids에서 삭제
                    bids_ref.child('2025').child('05').child(bid_id).delete()
                    deleted_bids += 1
                    print(f"🗑️ bids 삭제: {bid_id} - {detail['공고명']}")
                    
                    # user_inputs에서도 삭제
                    user_input_data = user_inputs_ref.child(bid_id).get()
                    if user_input_data:
                        user_inputs_ref.child(bid_id).delete()
                        deleted_user_inputs += 1
                        print(f"🗑️ user_inputs 삭제: {bid_id}")
                    
                    break
        except Exception as e:
            print(f"⚠️ 삭제 중 오류: {detail['공고명']} - {e}")
            failed_deletes.append(detail['공고명'])
    
    # 결과 출력
    print(f"\n✅ 삭제 완료!")
    print(f"🗑️ bids 삭제: {deleted_bids}건")
    print(f"🗑️ user_inputs 삭제: {deleted_user_inputs}건")
    
    if failed_deletes:
        print(f"⚠️ 삭제 실패: {len(failed_deletes)}건")
        for failed in failed_deletes[:10]:  # 최대 10개만 출력
            print(f"  - {failed}")
        if len(failed_deletes) > 10:
            print(f"  ... 외 {len(failed_deletes) - 10}건 더")

def manual_delete():
    """수동으로 입찰공고번호를 입력받아 삭제하는 함수"""
    
    print("\n📝 삭제할 입찰공고번호들을 입력해주세요 (쉼표로 구분):")
    print("예: R25BK00850538, R25BK00825310, R25BK00827634")
    
    bid_numbers = input("입찰공고번호들: ").strip()
    if not bid_numbers:
        print("❌ 입찰공고번호가 입력되지 않았습니다.")
        return
    
    # 쉼표로 구분하여 리스트로 변환
    bid_list = [bid.strip() for bid in bid_numbers.split(',') if bid.strip()]
    
    if not bid_list:
        print("❌ 유효한 입찰공고번호가 없습니다.")
        return
    
    print(f"\n🎯 삭제 대상: {len(bid_list)}개")
    for bid in bid_list:
        print(f"  - {bid}")
    
    # 사용자 확인
    confirm = input(f"\n위 {len(bid_list)}개 항목을 삭제하시겠습니까? (DELETE 입력): ")
    if confirm != 'DELETE':
        print("❌ 삭제가 취소되었습니다.")
        return
    
    # Firebase 초기화
    initialize_firebase()
    
    # Firebase 참조
    bids_ref = db.reference('/bids')
    user_inputs_ref = db.reference('/user_inputs')
    
    deleted_bids = 0
    deleted_user_inputs = 0
    not_found = []
    
    for bid_id in bid_list:
        try:
            # 모든 연도/월에서 해당 bid_id 찾기
            found = False
            years_data = bids_ref.get() or {}
            
            for year, months in years_data.items():
                for month, bids in months.items():
                    if bid_id in bids:
                        # bids에서 삭제
                        bids_ref.child(year).child(month).child(bid_id).delete()
                        deleted_bids += 1
                        print(f"🗑️ bids 삭제: {bid_id} ({year}-{month})")
                        found = True
                        break
                if found:
                    break
            
            if not found:
                not_found.append(bid_id)
                print(f"⚠️ 찾을 수 없음: {bid_id}")
                continue
            
            # user_inputs에서도 삭제
            user_input_data = user_inputs_ref.child(bid_id).get()
            if user_input_data:
                user_inputs_ref.child(bid_id).delete()
                deleted_user_inputs += 1
                print(f"🗑️ user_inputs 삭제: {bid_id}")
                
        except Exception as e:
            print(f"⚠️ 삭제 중 오류: {bid_id} - {e}")
            not_found.append(bid_id)
    
    # 결과 출력
    print(f"\n✅ 수동 삭제 완료!")
    print(f"🗑️ bids 삭제: {deleted_bids}건")
    print(f"🗑️ user_inputs 삭제: {deleted_user_inputs}건")
    
    if not_found:
        print(f"⚠️ 찾을 수 없었던 항목: {len(not_found)}건")
        for nf in not_found:
            print(f"  - {nf}")

def delete_by_date_range():
    """날짜 범위로 데이터를 삭제하는 함수"""
    
    print("\n📅 날짜 범위로 삭제하기")
    print("방금 수집한 데이터는 2025-05 (5월)에 있습니다.")
    
    year = input("연도 입력 (예: 2025): ").strip() or "2025"
    month = input("월 입력 (예: 05): ").strip() or "05"
    
    # 사용자 확인
    print(f"\n⚠️ {year}년 {month}월의 모든 데이터를 삭제하시겠습니까?")
    print("⚠️ 이 작업은 되돌릴 수 없습니다!")
    confirm = input("삭제하려면 'DELETE_ALL'을 입력하세요: ")
    
    if confirm != 'DELETE_ALL':
        print("❌ 삭제가 취소되었습니다.")
        return
    
    # Firebase 초기화
    initialize_firebase()
    
    # Firebase 참조
    bids_ref = db.reference('/bids')
    user_inputs_ref = db.reference('/user_inputs')
    
    try:
        # 해당 연도/월 데이터 가져오기
        month_data = bids_ref.child(year).child(month).get() or {}
        
        if not month_data:
            print(f"⚠️ {year}년 {month}월 데이터가 없습니다.")
            return
        
        print(f"📊 삭제 대상: {len(month_data)}건")
        
        # 모든 bid_id 수집
        bid_ids = list(month_data.keys())
        
        # bids에서 해당 월 전체 삭제
        bids_ref.child(year).child(month).delete()
        print(f"🗑️ {year}년 {month}월 bids 데이터 전체 삭제 완료")
        
        # user_inputs에서도 해당 bid_id들 삭제
        deleted_user_inputs = 0
        for bid_id in bid_ids:
            try:
                user_input_data = user_inputs_ref.child(bid_id).get()
                if user_input_data:
                    user_inputs_ref.child(bid_id).delete()
                    deleted_user_inputs += 1
            except Exception as e:
                print(f"⚠️ user_inputs 삭제 중 오류: {bid_id} - {e}")
        
        print(f"✅ 삭제 완료!")
        print(f"🗑️ bids 삭제: {len(month_data)}건")
        print(f"🗑️ user_inputs 삭제: {deleted_user_inputs}건")
        
    except Exception as e:
        print(f"❌ 삭제 중 오류 발생: {e}")

def main():
    print("🗑️ G2B 데이터 삭제 도구")
    print("=" * 30)
    
    print("삭제 방법을 선택하세요:")
    print("1. collection_result.json 기반 삭제 (방금 수집한 데이터)")
    print("2. 입찰공고번호 수동 입력 삭제")
    print("3. 날짜 범위 전체 삭제 (위험!)")
    
    choice = input("\n선택 (1-3): ").strip()
    
    if choice == "1":
        delete_recent_collection_data()
    elif choice == "2":
        manual_delete()
    elif choice == "3":
        delete_by_date_range()
    else:
        print("❌ 잘못된 선택입니다.")

if __name__ == "__main__":
    main()