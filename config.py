# import os
# import datetime
# from dotenv import load_dotenv

# # API 키 설정
# BID_API_KEY = os.getenv("BID_API_KEY")

# # 날짜 범위 자동 계산 함수
# def get_date_range():
#     today = datetime.datetime.now()
    
#     # 종료일 = 오늘
#     end_date = today.strftime("%Y%m%d")
    
#     # 시작일 = 3일 전
#     start_date = (today - datetime.timedelta(days=3)).strftime("%Y%m%d")
    
#     return start_date, end_date

# # 날짜 범위 자동 계산
# start_date, end_date = get_date_range()

# # 사용할 입찰 API 목록 (현재는 '용역' 카테고리 기준)
# BID_ENDPOINTS = [
#     {
#         "path": "getBidPblancListInfoServcPPSSrch",
#         "desc": "용역"
#     }
# ]

# SEARCH_KEYWORDS = [
#     "콜센터",
#     "헬프데스크", 
#     "고객센터",
#     "고객지원",
#     "고객상담",
#     "인바운드",
#     "아웃바운드",
#     "고객경험",
#     "상담센터",
#     "민원센터",
#     "해피콜",
#     "모니터링센터",
#     "상담시스템"
# ]

# # 🧾 기본 검색 설정값 (키워드는 SEARCH_KEYWORDS에서 가져옴)
# DEFAULT_INPUT = {
#     "start_date": start_date,  # 자동 계산된 시작일
#     "end_date": end_date,      # 자동 계산된 종료일
#     "keywords": SEARCH_KEYWORDS  # 키워드 리스트로 변경
# }

# # 기본 검색 조건 객체
# class SearchConfig:
#     def __init__(self, start_date=None, end_date=None, keyword=None):
#         self.start_date = start_date or DEFAULT_INPUT["start_date"]
#         self.end_date = end_date or DEFAULT_INPUT["end_date"]
#         self.keyword = keyword  # 단일 키워드

#     def get_filename(self):
#         from datetime import datetime
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         return f"{self.keyword}_입찰정보_{self.start_date}_{self.end_date}_{timestamp}.csv"



"""
G2B 수집 설정.

중요:
- 스케줄링(예: GitHub Actions) 환경에서는 `.env`가 없으므로 반드시 Secrets/환경변수로 `BID_API_KEY`를 주입해야 합니다.
- 조회 기간을 고정값으로 두면 시간이 지나면서 항상 0건이 될 수 있어, 기본은 "최근 N일" 자동 산출로 동작하게 합니다.
  - 필요 시 `START_DATE`, `END_DATE`(YYYYMMDD) 또는 `DAYS_BACK` 환경변수로 덮어쓸 수 있습니다.
"""

import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

# API 키 설정 (필수)
BID_API_KEY = os.getenv("BID_API_KEY")
if not BID_API_KEY:
    raise RuntimeError(
        "환경변수 'BID_API_KEY'가 설정되어 있지 않습니다. "
        "로컬은 .env에 BID_API_KEY를 넣고, GitHub Actions는 Secrets에 BID_API_KEY를 등록해 주세요."
    )


def _now_kst() -> datetime:
    """가능하면 KST(Asia/Seoul) 기준 현재 시각을 반환."""
    try:
        from zoneinfo import ZoneInfo  # py3.9+

        return datetime.now(ZoneInfo("Asia/Seoul"))
    except Exception:
        # zoneinfo/tzdata 미지원 환경이면 시스템 로컬 시간 사용
        return datetime.now()


def get_date_range(days_back: int = 3) -> tuple[str, str]:
    """조회 시작일/종료일(YYYYMMDD) 자동 계산. 기본: 최근 3일."""
    now = _now_kst()
    end = now.strftime("%Y%m%d")
    start = (now - timedelta(days=days_back)).strftime("%Y%m%d")
    return start, end


# 날짜 범위 설정 (환경변수로 우선 덮어쓰기)
start_date_env = os.getenv("START_DATE")
end_date_env = os.getenv("END_DATE")
days_back_env = os.getenv("DAYS_BACK", "3")

if start_date_env and end_date_env:
    start_date = start_date_env
    end_date = end_date_env
else:
    try:
        days_back = max(1, int(days_back_env))
    except ValueError:
        days_back = 3
    start_date, end_date = get_date_range(days_back=days_back)

# 사용할 입찰 API 목록 (현재는 '용역' 카테고리 기준)
BID_ENDPOINTS = [
    {
        "path": "getBidPblancListInfoServcPPSSrch",
        "desc": "용역"
    }
]

# 검색할 키워드 목록 
SEARCH_KEYWORDS = [
    "콜센터",
    "헬프데스크", 
    "고객센터",
    "고객지원",
    "고객상담",
    "인바운드",
    "아웃바운드",
    "고객경험",
    "상담센터",
    "민원센터",
    "해피콜",
    "모니터링센터",
    "상담시스템"
]

# 🧾 기본 검색 설정값 (키워드는 SEARCH_KEYWORDS에서 가져옴)
DEFAULT_INPUT = {
    "start_date": start_date,  # 수동 설정된 시작일
    "end_date": end_date,      # 수동 설정된 종료일
    "keywords": SEARCH_KEYWORDS  # 키워드 리스트로 변경
}

# 기본 검색 조건 객체
class SearchConfig:
    def __init__(self, start_date=None, end_date=None, keyword=None):
        self.start_date = start_date or DEFAULT_INPUT["start_date"]
        self.end_date = end_date or DEFAULT_INPUT["end_date"]
        self.keyword = keyword  # 단일 키워드

    def get_filename(self):
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{self.keyword}_입찰정보_{self.start_date}_{self.end_date}_{timestamp}.csv"