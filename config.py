import os
import datetime
from dotenv import load_dotenv

load_dotenv()

# API 키 설정
BID_API_KEY = os.getenv("BID_API_KEY")

# 날짜 범위 자동 계산 함수
def get_date_range():
    today = datetime.datetime.now()
    
    # 종료일 = 오늘
    end_date = today.strftime("%Y%m%d")
    
    # 시작일 = 14일 전
    start_date = (today - datetime.timedelta(days=1)).strftime("%Y%m%d")
    
    return start_date, end_date

# 날짜 범위 자동 계산
start_date, end_date = get_date_range()

# 사용할 입찰 API 목록 (현재는 '용역' 카테고리 기준)
BID_ENDPOINTS = [
    {
        "path": "getBidPblancListInfoServcPPSSrch",
        "desc": "용역"
    }
]

# 🧾 기본 검색 설정값
DEFAULT_INPUT = {
    "start_date": start_date,  # 자동 계산된 시작일
    "end_date": end_date,      # 자동 계산된 종료일
    "keyword": "콜센터"
}

# 기본 검색 조건 객체
class SearchConfig:
    def __init__(self, start_date=None, end_date=None, keyword=None):
        self.start_date = start_date or DEFAULT_INPUT["start_date"]
        self.end_date = end_date or DEFAULT_INPUT["end_date"]
        self.keyword = keyword or DEFAULT_INPUT["keyword"]

    def get_filename(self):
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{self.keyword}_입찰정보_{self.start_date}_{self.end_date}_{timestamp}.csv"