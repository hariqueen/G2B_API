# import firebase_admin
# from firebase_admin import credentials, db
# import json
# from collections import defaultdict
# import pprint

# # Firebase 초기화
# cred = credentials.Certificate('g2b-db-6aae9-firebase-adminsdk-fbsvc-0e3b1ce560.json')  # 서비스 계정 키 파일 경로 수정
# firebase_admin.initialize_app(cred, {
#     'databaseURL': 'https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/'
# })

# # Realtime Database 참조
# ref = db.reference('/')

# def explore_rtdb_structure():
#     """Firebase Realtime Database의 전체 구조를 탐색하여 출력합니다."""
    
#     print("Firebase Realtime Database 구조 탐색 중...")
    
#     # 루트 데이터 가져오기
#     data = ref.get()
    
#     if not data:
#         print("데이터베이스가 비어있거나 접근 권한이 없습니다.")
#         return
    
#     # 루트 키 목록 가져오기
#     if isinstance(data, dict):
#         root_keys = list(data.keys())
#     else:
#         print(f"예상치 못한 데이터 유형: {type(data)}")
#         return
    
#     print(f"\n=== 데이터베이스 루트 키 ({len(root_keys)}개) ===")
#     for key in root_keys:
#         print(f"- {key}")
    
#     # 각 루트 키 탐색
#     for root_key in root_keys:
#         print(f"\n=== 루트 키: {root_key} ===")
        
#         try:
#             # 해당 키의 데이터 가져오기
#             key_ref = ref.child(root_key)
#             key_data = key_ref.get()
            
#             if not isinstance(key_data, dict):
#                 print(f"  값 타입: {type(key_data).__name__}")
#                 print(f"  값: {str(key_data)[:100]}")
#                 continue
            
#             # 서브키(문서) 수 및 목록
#             sub_keys = list(key_data.keys())
#             print(f"  서브키 수: {len(sub_keys)}개")
            
#             if len(sub_keys) > 0:
#                 print(f"  샘플 서브키: {', '.join(sub_keys[:5])}" + ("..." if len(sub_keys) > 5 else ""))
                
#                 # 첫 번째 서브키의 데이터 구조 분석
#                 first_sub_key = sub_keys[0]
#                 first_doc = key_data[first_sub_key]
                
#                 if isinstance(first_doc, dict):
#                     print(f"\n  '{first_sub_key}' 문서의 필드 구조:")
#                     field_info = {}
                    
#                     for field, value in first_doc.items():
#                         value_type = type(value).__name__
#                         value_preview = str(value)[:50] + "..." if len(str(value)) > 50 else str(value)
#                         field_info[field] = {
#                             "type": value_type,
#                             "preview": value_preview
#                         }
                    
#                     # 필드 정보 출력
#                     for field, info in field_info.items():
#                         print(f"    - {field} ({info['type']}): {info['preview']}")
                    
#                     # 동일한 구조인지 확인 (샘플 5개 문서)
#                     print("\n  구조 일관성 확인 (최대 5개 문서):")
#                     fields_in_docs = []
                    
#                     for i, sub_key in enumerate(sub_keys[:5]):
#                         doc = key_data[sub_key]
#                         if isinstance(doc, dict):
#                             fields_in_docs.append(set(doc.keys()))
                    
#                     if len(fields_in_docs) > 1:
#                         all_same = all(fields == fields_in_docs[0] for fields in fields_in_docs)
#                         print(f"    {'✅ 모든 문서가 동일한 필드 구조' if all_same else '⚠️ 문서마다 필드 구조가 다름'}")
                        
#                         if not all_same:
#                             # 필드 차이 보여주기
#                             all_fields = set()
#                             for fields in fields_in_docs:
#                                 all_fields.update(fields)
                            
#                             print("    필드 출현 빈도:")
#                             for field in sorted(all_fields):
#                                 count = sum(1 for fields in fields_in_docs if field in fields)
#                                 print(f"      - {field}: {count}/{len(fields_in_docs)} 문서에 존재")
#                 else:
#                     print(f"  첫 번째 서브키 '{first_sub_key}'의 값 타입: {type(first_doc).__name__}")
#                     print(f"  값: {str(first_doc)[:100]}")
        
#         except Exception as e:
#             print(f"  오류 발생: {e}")
    
#     print("\n=== 데이터베이스 구조 탐색 완료 ===")

# # 실행
# explore_rtdb_structure()








import firebase_admin
from firebase_admin import credentials
from firebase_admin import db
import pandas as pd
from datetime import datetime

# Firebase 초기화
def initialize_firebase():
    try:
        firebase_admin.get_app()
    except ValueError:
        # 초기화되지 않은 경우 새로 초기화
        cred = credentials.Certificate('g2b-db-6aae9-firebase-adminsdk-fbsvc-0e3b1ce560.json')
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/'
        })
    print("Firebase 초기화 완료")

# 새 필드 추가 함수
def add_new_fields():
    # Firebase 초기화
    initialize_firebase()
    
    # 데이터 참조 가져오기
    bids_ref = db.reference('/bids')
    
    # 모든 데이터 가져오기
    bids_data = bids_ref.get() or {}
    
    # 각 데이터에 새 필드 추가
    updated_count = 0
    
    for year in bids_data:
        for month in bids_data[year]:
            for bid_id, bid_info in bids_data[year][month].items():
                # 필드가 없는 경우에만 추가
                updated = False
                
                if "유찰사유" not in bid_info:
                    bid_info["유찰사유"] = ""
                    updated = True
                
                if "입찰공고번호" not in bid_info:
                    bid_info["입찰공고번호"] = ""
                    updated = True
                
                # 변경된 경우만 업데이트
                if updated:
                    # 특정 입찰 항목의 참조 가져오기
                    item_ref = db.reference(f'/bids/{year}/{month}/{bid_id}')
                    # 업데이트
                    item_ref.update({
                        "유찰사유": bid_info["유찰사유"],
                        "입찰공고번호": bid_info["입찰공고번호"]
                    })
                    updated_count += 1
    
    print(f"총 {updated_count}개 항목에 새 필드 추가 완료")

# 실행
if __name__ == "__main__":
    add_new_fields()