# G2B 입찰 데이터 수집 및 Firebase 적재 구조

## 1. 프로젝트 개요

공공데이터포털(data.go.kr)의 **나라장터(G2B) API**를 활용하여 **용역 카테고리**의 입찰공고 및 개찰결과 데이터를 수집하고, **Firebase Realtime Database**에 적재하는 자동화 시스템입니다.

- **Firebase 프로젝트**: `g2b-db-6aae9`
- **DB 리전**: Asia Southeast 1 (싱가포르)
- **DB URL**: `https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/`
- **대시보드**: https://g2b.onrender.com

---

## 2. 사용 API 목록

총 **4개의 공공데이터포털 API**를 호출하여 데이터를 수집합니다.

### 2-1. 입찰공고 조회 API (1차 수집)

| 항목 | 내용 |
|------|------|
| **API명** | 입찰공고목록 정보 조회 (용역) |
| **엔드포인트** | `http://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoServcPPSSrch` |
| **파일** | `data_processor.py` → `fetch_bid_data()` |
| **설명** | 키워드 및 날짜 범위를 기반으로 용역 입찰공고 목록을 조회합니다. |

**요청 파라미터:**

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `serviceKey` | `{BID_API_KEY}` | 공공데이터포털 API 인증키 |
| `pageNo` | 1 | 페이지 번호 |
| `numOfRows` | 100 | 한 페이지당 결과 수 |
| `inqryDiv` | 1 | 조회 구분 |
| `inqryBgnDt` | `{start_date}0000` | 조회 시작일시 (YYYYMMDD + 0000) |
| `inqryEndDt` | `{end_date}2359` | 조회 종료일시 (YYYYMMDD + 2359) |
| `type` | json | 응답 형식 |
| `bidNtceNm` | `{keyword}` | 검색 키워드 (공고명 기준) |

**추출 필드:**

| API 응답 필드 | 저장 필드명 | 타입 | 설명 |
|--------------|-----------|------|------|
| `bidNtceDt` | 입찰일시 | string | 입찰공고 일시 |
| `bidNtceNm` | 공고명 | string | 입찰공고 이름 |
| `crdtrNm` | 채권자명 | string | 발주 기관명 |
| `presmptPrce` + `VAT` | 사업금액 | number | 추정가격 + 부가세 합산 |
| `bidNtceNo` | 입찰공고번호 | string | 입찰공고 고유번호 (이후 API 조회 키) |

> **참고**: API에서 키워드 필터링 후, 클라이언트 측에서도 `bidNtceNm`에 키워드가 포함되어 있는지 2차 검증합니다. (`process_bid_items()`)

---

### 2-2. 낙찰금액 조회 API (2차 수집)

| 항목 | 내용 |
|------|------|
| **API명** | 낙찰정보 조회 (용역) |
| **엔드포인트** | `http://apis.data.go.kr/1230000/as/ScsbidInfoService/getScsbidListSttusServc` |
| **파일** | `scsbid_client.py` → `get_scsbid_amount()` |
| **설명** | 입찰공고번호를 기반으로 해당 건의 낙찰금액을 조회합니다. |

**요청 파라미터:**

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `serviceKey` | `{BID_API_KEY}` | 공공데이터포털 API 인증키 |
| `pageNo` | 1 | 페이지 번호 |
| `numOfRows` | 1 | 한 페이지당 결과 수 |
| `inqryDiv` | 4 | 조회 구분 (입찰공고번호 기반) |
| `type` | json | 응답 형식 |
| `bidNtceNo` | `{입찰공고번호}` | 1차에서 수집한 입찰공고번호 |
| `inqryBgnDt` | `202401010000` | 조회 시작일시 (고정값) |
| `inqryEndDt` | `202512312359` | 조회 종료일시 (고정값) |

**추출 필드:**

| API 응답 필드 | 저장 필드명 | 타입 | 설명 |
|--------------|-----------|------|------|
| `sucsfbidAmt` | 낙찰금액 | number | 낙찰 금액 (없으면 유찰로 판단) |

---

### 2-3. 개찰업체정보 / bidClsfcNo 조회 API (2차 수집)

| 항목 | 내용 |
|------|------|
| **API명** | 개찰결과 목록 정보 조회 (용역) |
| **엔드포인트** | `http://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoServcPPSSrch` |
| **파일** | `scsbid_client.py` → `get_openg_corp_info()`, `get_bid_clsfc_no()` |
| **설명** | 입찰공고번호를 기반으로 개찰업체 정보와 bidClsfcNo를 조회합니다. 동일한 API를 2개 함수에서 각각 호출합니다. |

**요청 파라미터:**

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `serviceKey` | `{BID_API_KEY}` | 공공데이터포털 API 인증키 |
| `pageNo` | 1 | 페이지 번호 |
| `numOfRows` | 1 | 한 페이지당 결과 수 |
| `inqryDiv` | 3 | 조회 구분 |
| `type` | json | 응답 형식 |
| `bidNtceNo` | `{입찰공고번호}` | 1차에서 수집한 입찰공고번호 |
| `inqryBgnDt` | `202401010000` | 조회 시작일시 (고정값) |
| `inqryEndDt` | `202512312359` | 조회 종료일시 (고정값) |

**추출 필드:**

| API 응답 필드 | 추출 함수 | 저장 필드명 | 타입 | 설명 |
|--------------|----------|-----------|------|------|
| `opengCorpInfo` | `get_openg_corp_info()` | 개찰업체정보 | string | 개찰 업체 정보 |
| `bidClsfcNo` | `get_bid_clsfc_no()` | _(내부 사용)_ | string | 유찰사유 조회를 위한 입찰분류번호 |

> **데이터 정제**: `개찰업체정보`는 `clean_company_info()` 함수를 통해 `^` 구분자 이후 부분이 제거됩니다. (예: `"주식회사OO^12345^..."` → `"주식회사OO"`)

---

### 2-4. 유찰사유 조회 API (3차 수집 - 조건부)

| 항목 | 내용 |
|------|------|
| **API명** | 개찰결과 유찰 정보 조회 |
| **엔드포인트** | `http://apis.data.go.kr/1230000/as/ScsbidInfoService/getOpengResultListInfoFailing` |
| **파일** | `scsbid_client.py` → `get_nobid_reason()` |
| **설명** | 낙찰금액이 없는 경우(유찰)에만 유찰 사유를 조회합니다. |

**호출 조건:**
- `낙찰금액`이 없을 때(`not amount`)만 호출
- 추가로 `bidClsfcNo`가 존재해야 호출 (없으면 `"bidClsfcNo 없음"` 기록)

**요청 파라미터:**

| 파라미터 | 값 | 설명 |
|----------|-----|------|
| `serviceKey` | `{BID_API_KEY}` | 공공데이터포털 API 인증키 |
| `pageNo` | 1 | 페이지 번호 |
| `numOfRows` | 1 | 한 페이지당 결과 수 |
| `type` | json | 응답 형식 |
| `bidNtceNo` | `{입찰공고번호}` | 입찰공고번호 |
| `bidClsfcNo` | `{입찰분류번호}` | 2-3에서 조회한 입찰분류번호 |
| `inqryBgnDt` | `202401010000` | 조회 시작일시 (고정값) |
| `inqryEndDt` | `202512312359` | 조회 종료일시 (고정값) |

**추출 필드:**

| API 응답 필드 | 저장 필드명 | 타입 | 설명 |
|--------------|-----------|------|------|
| `nobidRsn` | 유찰사유 | string | 유찰 사유 |

---

## 3. 검색 설정

### 3-1. 검색 키워드 목록

다음 **13개 키워드**를 순차적으로 검색합니다 (`config.py` → `SEARCH_KEYWORDS`):

| # | 키워드 |
|---|--------|
| 1 | 콜센터 |
| 2 | 헬프데스크 |
| 3 | 고객센터 |
| 4 | 고객지원 |
| 5 | 고객상담 |
| 6 | 인바운드 |
| 7 | 아웃바운드 |
| 8 | 고객경험 |
| 9 | 상담센터 |
| 10 | 민원센터 |
| 11 | 해피콜 |
| 12 | 모니터링센터 |
| 13 | 상담시스템 |

### 3-2. 날짜 범위 설정 (`config.py`)

두 가지 모드가 존재하며, **현재는 수동 설정 모드**가 활성화되어 있습니다:

| 모드 | 상태 | 설명 |
|------|------|------|
| **자동 계산** (주석 처리됨) | 비활성 | `오늘 - 3일` ~ `오늘` 자동 계산 |
| **수동 설정** (현재 활성) | 활성 | `start_date`, `end_date`를 직접 지정 (현재: `20250703` ~ `20250722`) |

### 3-3. 입찰 카테고리

현재 **용역(`getBidPblancListInfoServcPPSSrch`)** 카테고리만 수집합니다.

```python
BID_ENDPOINTS = [
    { "path": "getBidPblancListInfoServcPPSSrch", "desc": "용역" }
]
```

---

## 4. Firebase 적재 구조

Firebase Realtime Database에 **2개의 최상위 노드**로 데이터를 적재합니다.

### 4-1. `/bids` - 입찰 데이터 (API 수집 데이터)

```
/bids
  └── {연도}                     # 예: "2025" (입찰일시 기준 파싱)
       └── {월}                  # 예: "07" (2자리, 입찰일시 기준 파싱)
            └── {입찰공고번호}    # 예: "R25BK00850538" (문서 키)
                 ├── 입찰일시      (string)  # "2025-07-15 10:00:00"
                 ├── 공고명        (string)  # "콜센터 운영 용역"
                 ├── 채권자명      (string)  # "서울특별시"
                 ├── 사업금액      (number)  # 150000000 (추정가격+VAT)
                 ├── 입찰공고번호  (string)  # "R25BK00850538"
                 ├── 낙찰금액      (number)  # 140000000 (없으면 0 또는 빈값)
                 ├── 개찰업체정보  (string)  # "주식회사 OO" (^이후 제거)
                 └── 유찰사유      (string)  # "" 또는 유찰사유 텍스트
```

**저장되는 필드 (총 8개):**

| # | 필드명 | 타입 | 출처 API | 설명 |
|---|--------|------|----------|------|
| 1 | 입찰일시 | string | 입찰공고 조회 | 입찰 공고 일시 |
| 2 | 공고명 | string | 입찰공고 조회 | 입찰 공고명 |
| 3 | 채권자명 | string | 입찰공고 조회 | 발주 기관명 |
| 4 | 사업금액 | number | 입찰공고 조회 | 추정가격 + VAT |
| 5 | 입찰공고번호 | string | 입찰공고 조회 | 공고 고유번호 |
| 6 | 낙찰금액 | number | 낙찰정보 조회 | 낙찰 금액 |
| 7 | 개찰업체정보 | string | 개찰결과 조회 | 낙찰 업체 정보 (^ 이후 제거) |
| 8 | 유찰사유 | string | 유찰정보 조회 | 유찰된 경우 사유 |

**경로 키 생성 규칙:**
- `{연도}`, `{월}`: `입찰일시` 필드를 `%Y-%m-%d %H:%M:%S` 형식으로 파싱하여 추출
- `{입찰공고번호}`: 입찰공고번호 사용. 비어있을 경우 `bid_{timestamp}_{count}` 형태로 폴백 키 자동 생성

### 4-2. `/user_inputs` - 사용자 입력 데이터 (자동 생성)

```
/user_inputs
  └── {입찰공고번호}              # 예: "R25BK00850538" (문서 키)
       ├── 물동량 평균       (number)  # 기본값: 0
       ├── 용역기간(개월)    (number)  # 기본값: 0
       ├── 마지막_수정일     (string)  # "2025-07-15 10:30:00"
       └── 수정자            (string)  # "system_auto"
```

**저장되는 필드 (총 4개):**

| # | 필드명 | 타입 | 기본값 | 설명 |
|---|--------|------|--------|------|
| 1 | 물동량 평균 | number | 0 | 사용자가 대시보드에서 입력 |
| 2 | 용역기간(개월) | number | 0 | 사용자가 대시보드에서 입력 |
| 3 | 마지막_수정일 | string | 생성 시점 | 마지막 수정 일시 (`%Y-%m-%d %H:%M:%S`) |
| 4 | 수정자 | string | `"system_auto"` | 수정한 사용자 |

**생성 시점:**
- `upload_to_firebase()`: 각 건의 Firebase 적재 시 해당 `bid_id`에 대한 `user_inputs`가 없으면 자동 생성
- `create_missing_user_inputs()`: 전체 수집 완료 후 `/bids` 내 모든 `bid_id`를 순회하며 `user_inputs`가 누락된 항목을 백필(backfill) 생성

---

## 5. 데이터 수집 흐름

```
[시작] main.py 실행
  │
  ├─ 검색 조건 로드 (config.py)
  │   ├─ 날짜 범위: start_date ~ end_date
  │   └─ 키워드 목록: SEARCH_KEYWORDS (13개)
  │
  ▼
┌──────────────────────────────────────────────────┐
│  키워드별 순차 처리 (process_single_keyword)      │
│  키워드: "콜센터" → "헬프데스크" → ... (13개)     │
└──────────────┬───────────────────────────────────┘
               │ 각 키워드마다
               ▼
┌──────────────────────────────────────────────────┐
│  1차: 입찰공고 조회 API 호출                      │
│  (getBidPblancListInfoServcPPSSrch)               │
│  → 입찰일시, 공고명, 채권자명,                    │
│    사업금액, 입찰공고번호 추출                     │
│  → 클라이언트 측 키워드 2차 필터링                │
└──────────────┬───────────────────────────────────┘
               │ 각 공고번호별 반복
               ▼
┌──────────────────────────────────────────────────┐
│  2차-A: 낙찰금액 조회 API 호출                    │
│  (getScsbidListSttusServc)                        │
│  → 낙찰금액(sucsfbidAmt) 추출                     │
├──────────────────────────────────────────────────┤
│  2차-B: 개찰업체정보 조회 API 호출                │
│  (getOpengResultListInfoServcPPSSrch)             │
│  → 개찰업체정보(opengCorpInfo) 추출               │
│  → clean_company_info()로 ^ 이후 제거             │
└──────────────┬───────────────────────────────────┘
               │ 낙찰금액이 없는 경우만
               ▼
┌──────────────────────────────────────────────────┐
│  2차-C: bidClsfcNo 조회 API 호출                  │
│  (getOpengResultListInfoServcPPSSrch) ← 동일 API  │
│  → bidClsfcNo 추출                                │
│                                                    │
│  (bidClsfcNo가 있을 때만)                          │
│  3차: 유찰사유 조회 API 호출                       │
│  (getOpengResultListInfoFailing)                   │
│  → 유찰사유(nobidRsn) 추출                         │
│                                                    │
│  (bidClsfcNo가 없으면)                             │
│  → 유찰사유 = "bidClsfcNo 없음"                    │
└──────────────┬───────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────┐
│  Firebase 적재 (키워드별 즉시 업로드)              │
│  upload_to_firebase()                              │
│                                                    │
│  /bids/{연도}/{월}/{입찰공고번호}                   │
│  → 중복 확인 → 신규추가 / 업데이트 / 건너뜀        │
│                                                    │
│  /user_inputs/{입찰공고번호}                       │
│  → 없으면 자동 생성 (4개 기본 필드)                │
└──────────────────────────────────────────────────┘
               │
               ▼ (모든 키워드 처리 완료 후)
┌──────────────────────────────────────────────────┐
│  후처리                                           │
│  1. collection_result.json 저장                   │
│  2. create_missing_user_inputs() 실행             │
│     → /bids 전체 순회하며 user_inputs 백필         │
└──────────────────────────────────────────────────┘
```

---

## 6. 중복 처리 로직

Firebase 적재 시 (`upload_to_firebase()`) 다음 기준으로 중복을 처리합니다:

### 6-1. 중복 판별

- **기준**: 동일 `{연도}/{월}` 경로 내에서 `입찰일시` + `공고명`이 모두 동일한 항목
- 중복 발견 시 기존 데이터의 `bid_id`를 재사용

### 6-2. 처리 분기

| 상황 | 처리 | 방식 |
|------|------|------|
| **신규 데이터** | 추가 | `set()` |
| **중복 + 신규 정보 있음** | 업데이트 | `update()` |
| **중복 + 변경 없음** | 건너뜀 | 무시 |

### 6-3. 업데이트 조건

기존 데이터에서 다음 필드가 비어있고(`falsy`), 새 데이터에 값이 있으면 업데이트:
- `낙찰금액`
- `개찰업체정보`
- `유찰사유`

---

## 7. 출력 파일

### 7-1. `collection_result.json` (자동 생성)

수집 완료 후 생성되며, GitHub Actions 이메일 알림에서 참조합니다.

```json
{
  "total_count": 25,
  "collection_date": "2025-07-15 10:30:00",
  "keyword_results": {
    "콜센터": 5,
    "헬프데스크": 3,
    "고객센터": 7,
    ...
  },
  "keywords": ["콜센터", "헬프데스크", ...],
  "bid_details": [
    {
      "공고명": "콜센터 운영 위탁 용역",
      "채권자명": "서울특별시"
    },
    ...
  ]
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `total_count` | number | 총 수집 건수 |
| `collection_date` | string | 수집 완료 시간 |
| `keyword_results` | object | 키워드별 수집 건수 |
| `keywords` | array | 검색 키워드 목록 |
| `bid_details` | array | 수집된 공고 요약 (공고명 + 채권자명) |

> **참고**: 수집 데이터가 0건이어도 파일은 생성됩니다.

---

## 8. 보조 도구

### 8-1. `check_firebase.py` - Firebase 데이터 관리 도구

로컬에서 직접 실행하여 Firebase 데이터를 관리하는 도구입니다.

**제공 기능:**

| # | 함수 | 설명 |
|---|------|------|
| 1 | `add_new_fields()` | 기존 `/bids` 데이터에 `유찰사유`, `입찰공고번호` 필드가 없으면 빈값으로 추가 (마이그레이션용) |
| 2 | `delete_recent_collection_data()` | `collection_result.json` 기반으로 방금 수집한 데이터를 `/bids`와 `/user_inputs`에서 삭제 |
| 3 | `manual_delete()` | 입찰공고번호를 쉼표로 구분하여 수동 입력 후 삭제 |
| 4 | `delete_by_date_range()` | 특정 연도/월의 전체 데이터를 `/bids`와 `/user_inputs`에서 일괄 삭제 |

> **주의**: 삭제 시 `DELETE` 또는 `DELETE_ALL` 입력 확인을 거칩니다.

### 8-2. `data_processor.py` - 독립 실행 모드

`data_processor.py`는 모듈로 임포트되어 사용될 뿐 아니라, 독립적으로 실행할 수도 있습니다.

- 독립 실행 시 수집 결과를 **CSV 파일로 내보내기** (Firebase 적재 없음)
- 출력 경로: `utils.py` → `get_output_path()`로 OS별 경로 자동 결정
  - Windows: `g:/내 드라이브/업무용/MetaM/g2b/`
  - macOS/Linux: `~/Library/CloudStorage/GoogleDrive-.../내 드라이브/업무용/MetaM/g2b/`

---

## 9. 자동화 (GitHub Actions)

### 9-1. 워크플로우 설정

| 항목 | 내용 |
|------|------|
| **워크플로우 파일** | `.github/workflows/scheduled-run.yml` |
| **실행 주기** | 매일 오전 8시 (KST) = UTC 23:00 (`cron: '0 23 * * *'`) |
| **수동 실행** | `workflow_dispatch`로 수동 실행 가능 |
| **런타임** | `ubuntu-latest`, Python 3.x |

### 9-2. 실행 단계

```
1. 코드 체크아웃
2. Python 3.x 설정
3. pip install -r requirements.txt
4. Firebase 인증 파일 생성 (Secrets → JSON 파일)
5. python main.py 실행
6. collection_result.json 읽기 (jq로 파싱)
7. 이메일 알림 발송 (성공/실패)
```

### 9-3. 이메일 알림

| 항목 | 성공 시 | 실패 시 |
|------|---------|---------|
| **제목** | `[G2B 수집완료] {N}건 수집 (다중키워드)` | `[G2B 오류] 다중키워드 데이터 수집 실패` |
| **내용** | 총 수집 건수, 키워드별 현황, 공고 목록 (최대 20건) | 오류 정보, 워크플로우 링크 |
| **수신** | `hariqueen98@gmail.com` | `hariqueen98@gmail.com` |
| **발신** | G2B 수집시스템 | G2B 수집시스템 |

---

## 10. 파일 구조

```
G2B_API/
├── main.py                # 메인 실행 파일 (키워드별 수집 + Firebase 적재)
│                           ├── initialize_firebase()     - Firebase 초기화
│                           ├── upload_to_firebase()      - 데이터 업로드 + 중복처리
│                           ├── create_missing_user_inputs() - user_inputs 백필
│                           ├── clean_company_info()      - 개찰업체정보 정제 (^ 제거)
│                           ├── process_single_keyword()  - 단일 키워드 수집
│                           └── main()                    - 전체 실행 흐름
│
├── config.py              # 설정 파일
│                           ├── BID_API_KEY               - API 인증키 (.env)
│                           ├── BID_ENDPOINTS             - API 엔드포인트 목록
│                           ├── SEARCH_KEYWORDS           - 검색 키워드 13개
│                           ├── DEFAULT_INPUT             - 기본 검색 설정값
│                           └── SearchConfig              - 검색 조건 클래스
│
├── data_processor.py      # 입찰공고 조회 및 항목 처리
│                           ├── fetch_bid_data()          - API 호출
│                           ├── process_bid_items()       - 응답 파싱 + 키워드 필터링
│                           └── main()                    - 독립 실행 (CSV 내보내기)
│
├── scsbid_client.py       # 낙찰/개찰/유찰 API 클라이언트
│                           ├── get_scsbid_amount()       - 낙찰금액 조회
│                           ├── get_openg_corp_info()     - 개찰업체정보 조회
│                           ├── get_bid_clsfc_no()        - bidClsfcNo 조회
│                           └── get_nobid_reason()        - 유찰사유 조회
│
├── utils.py               # 유틸리티
│                           ├── parse_arguments()         - CLI 인자 파싱
│                           ├── print_execution_time()    - 실행 시간 출력
│                           └── get_output_path()         - OS별 출력 경로 결정
│
├── check_firebase.py      # Firebase 데이터 관리/삭제 도구 (로컬 전용)
├── collection_result.json # 수집 결과 (자동 생성, GitHub Actions 알림용)
├── requirements.txt       # 의존성 패키지
├── .gitignore             # Git 제외 파일 설정
└── .github/
    └── workflows/
        └── scheduled-run.yml  # GitHub Actions 워크플로우
```

---

## 11. 의존성 패키지

`requirements.txt`:

| 패키지 | 용도 |
|--------|------|
| `requests` | HTTP API 호출 |
| `python-dotenv` | `.env` 파일에서 환경변수 로드 |
| `firebase-admin` | Firebase Realtime Database 접근 |
| `pandas` | 데이터프레임 처리 및 CSV 내보내기 (`data_processor.py` 독립 실행 시) |

---

## 12. 환경 변수 / Secrets

| 변수명 | 용도 | 사용 위치 |
|--------|------|-----------|
| `BID_API_KEY` | 공공데이터포털 API 인증키 | `.env` 파일 (로컬) |
| `FIREBASE_CREDENTIALS` | Firebase 서비스 계정 JSON 문자열 | GitHub Secrets → 환경변수 또는 JSON 파일 생성 |
| `EMAIL_USERNAME` | Gmail 발송 계정 | GitHub Secrets |
| `EMAIL_PASSWORD` | Gmail 앱 비밀번호 | GitHub Secrets |

**Firebase 인증 방식:**

| 환경 | 인증 방식 |
|------|-----------|
| **GitHub Actions** | `FIREBASE_CREDENTIALS` 환경변수 → JSON 파싱 → `credentials.Certificate()` |
| **로컬 개발** | `g2b-db-6aae9-firebase-adminsdk-fbsvc-0e3b1ce560.json` 파일 직접 참조 |

> **참고**: Firebase 서비스 계정 키 파일(`*-firebase-adminsdk-*.json`)은 `.gitignore`에 등록되어 Git에 포함되지 않습니다.
