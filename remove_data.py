import firebase_admin
from firebase_admin import credentials
from firebase_admin import db

def initialize_firebase():
    try:
        # 이미 초기화된 경우 앱 정보 반환
        firebase_admin.get_app()
    except ValueError:
        # 초기화되지 않은 경우 새로 초기화
        try:
            cred = credentials.Certificate('g2b-db-6aae9-firebase-adminsdk-fbsvc-0e3b1ce560.json')
            firebase_admin.initialize_app(cred, {
                'databaseURL': 'https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/'
            })
        except FileNotFoundError:
            print("Firebase 인증 파일을 찾을 수 없습니다.")
            raise
    print("Firebase 초기화 완료")

def delete_2025_data():
    print("2025년 데이터 삭제 시작...")
    
    # Firebase 초기화
    initialize_firebase()
    
    # bids/2025 경로 참조
    bids_2025_ref = db.reference('/bids/2025')
    
    # user_inputs 참조
    user_inputs_ref = db.reference('/user_inputs')
    
    try:
        # 2025년 데이터의 모든 bid_id 수집
        bids_2025_data = bids_2025_ref.get() or {}
        bid_ids_to_delete = []
        
        # 각 월별 데이터를 확인하여 bid_id 수집
        for month, bids in bids_2025_data.items():
            for bid_id in bids.keys():
                bid_ids_to_delete.append(bid_id)
        
        print(f"총 {len(bid_ids_to_delete)}개의 2025년 입찰 데이터를 찾았습니다.")
        
        # 1. user_inputs에서 해당 bid_id 삭제
        deleted_user_inputs = 0
        for bid_id in bid_ids_to_delete:
            # 개별 데이터 삭제
            user_input_ref = user_inputs_ref.child(bid_id)
            if user_input_ref.get() is not None:
                user_input_ref.delete()
                deleted_user_inputs += 1
        
        print(f"{deleted_user_inputs}개의 user_inputs 데이터 삭제 완료")
        
        # 2. bids/2025 전체 삭제
        bids_2025_ref.delete()
        print("bids/2025 전체 데이터 삭제 완료")
        
        print("2025년 데이터 삭제 완료!")
        
    except Exception as e:
        print(f"데이터 삭제 중 오류 발생: {e}")

if __name__ == "__main__":
    delete_2025_data()