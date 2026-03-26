/* ============================================================
   비주얼 가계부 - 메인 애플리케이션 로직
   ============================================================
   이 파일이 하는 일:
   1. LocalStorage에서 거래 데이터를 불러오고 저장하는 역할
   2. 수입/지출 내역을 추가/삭제하는 CRUD 기능
   3. 요약 카드(총 수입, 총 지출, 잔액)를 실시간 업데이트
   4. Chart.js로 카테고리별 지출 비율 원형 차트를 그림
   5. 거래 내역을 리스트로 렌더링 (필터링 포함)
   ============================================================ */

// ============================================================
// 1. 카테고리 정의
// ============================================================
// 각 카테고리에는 이름(name), 아이콘(icon), 차트 색상(color)이 있음
// 수입과 지출을 별도 객체로 분리하여 관리

// --- 기본 카테고리 (삭제 불가, 앱에 내장된 카테고리) ---
// DEFAULT_CATEGORIES는 절대 변경되지 않는 원본 데이터
// 사용자가 추가한 커스텀 카테고리와 구분하기 위해 별도로 관리
const DEFAULT_CATEGORIES = {
    expense: [
        { name: '식비',     icon: '🍔', color: '#ff6b6b' },
        { name: '교통',     icon: '🚌', color: '#ffa502' },
        { name: '쇼핑',     icon: '🛍️', color: '#ff9ff3' },
        { name: '주거',     icon: '🏠', color: '#54a0ff' },
        { name: '통신',     icon: '📱', color: '#5f27cd' },
        { name: '의료',     icon: '💊', color: '#01a3a4' },
        { name: '문화',     icon: '🎬', color: '#f368e0' },
        { name: '교육',     icon: '📚', color: '#ff9f43' },
        { name: '경조사',   icon: '🎁', color: '#ee5a24' },
        { name: '기타지출', icon: '💸', color: '#8395a7' },
    ],
    income: [
        { name: '급여',     icon: '💵', color: '#00d4aa' },
        { name: '부수입',   icon: '💰', color: '#2ed573' },
        { name: '용돈',     icon: '🤑', color: '#7bed9f' },
        { name: '투자',     icon: '📈', color: '#1abc9c' },
        { name: '기타수입', icon: '✨', color: '#26de81' },
    ],
};

// --- 사용자 커스텀 카테고리 LocalStorage 키 ---
const CUSTOM_CAT_KEY = 'visual-ledger-custom-categories';

/**
 * LocalStorage에서 사용자가 추가한 커스텀 카테고리를 불러옴
 * @returns {Object} { expense: [...], income: [...] } 형태
 */
function loadCustomCategories() {
    try {
        const data = localStorage.getItem(CUSTOM_CAT_KEY);
        return data ? JSON.parse(data) : { expense: [], income: [] };
    } catch {
        return { expense: [], income: [] };
    }
}

/**
 * 커스텀 카테고리를 LocalStorage에 저장
 * @param {Object} custom - { expense: [...], income: [...] }
 */
function saveCustomCategories(custom) {
    localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(custom));
}

// 사용자 커스텀 카테고리 (앱 실행 시 LocalStorage에서 불러옴)
let customCategories = loadCustomCategories();

// --- CATEGORIES: 기본 + 커스텀을 합친 실제 사용 카테고리 ---
// 이 객체가 앱 전체에서 카테고리 목록으로 사용됨
// 커스텀 카테고리가 변경될 때마다 rebuildCategories()로 재구성
const CATEGORIES = {
    expense: [],
    income: [],
};

/**
 * 기본 카테고리 + 커스텀 카테고리를 합쳐서 CATEGORIES를 재구성
 * 커스텀 카테고리를 추가/수정/삭제한 뒤 반드시 호출해야 함
 */
function rebuildCategories() {
    CATEGORIES.expense = [...DEFAULT_CATEGORIES.expense, ...customCategories.expense];
    CATEGORIES.income = [...DEFAULT_CATEGORIES.income, ...customCategories.income];
}

// 앱 시작 시 카테고리 목록 초기 구성
rebuildCategories();

// ============================================================
// 2. LocalStorage 관련 유틸리티 함수
// ============================================================
// LocalStorage의 키 이름. 이 키로 모든 거래 데이터를 저장/조회함
const STORAGE_KEY = 'visual-ledger-transactions';

/**
 * LocalStorage에서 거래 내역 배열을 불러옴
 * - 저장된 데이터가 없으면 빈 배열을 반환
 * - JSON 파싱 실패 시에도 빈 배열을 반환 (데이터 손상 대비)
 * @returns {Array} 거래 내역 객체들의 배열
 */
function loadTransactions() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('LocalStorage 데이터 불러오기 실패:', error);
        return [];
    }
}

/**
 * 거래 내역 배열을 LocalStorage에 JSON 문자열로 저장
 * @param {Array} transactions - 저장할 거래 내역 배열
 */
function saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

// ============================================================
// 3. 전역 상태 및 DOM 요소 참조
// ============================================================

// 앱의 전체 거래 내역을 담는 배열 (앱의 "단일 진실 소스")
let transactions = loadTransactions();

// 현재 선택된 유형 (expense 또는 income)
let currentType = 'expense';

// 현재 선택된 필터 (all, income, expense)
let currentFilter = 'all';

// 현재 보기 모드 (daily, monthly, yearly)
let currentView = 'daily';

// 일별 보기에서 선택된 날짜 (YYYY-MM-DD 문자열)
let selectedDate = new Date().toISOString().split('T')[0];

// 월별 보기에서 선택된 년도와 월 (0-indexed month)
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth();

// 월 드롭다운에서 탐색 중인 년도
let dropdownYear = new Date().getFullYear();

// 년도별 보기에서 선택된 년도
let selectedViewYear = new Date().getFullYear();

// 지출 보고서에서 선택된 년도와 월 (0-indexed month)
let reportYear = new Date().getFullYear();
let reportMonth = new Date().getMonth();

// --- DOM 요소 캐싱 (매번 querySelector를 호출하지 않기 위해 미리 저장) ---
const DOM = {
    form:            document.getElementById('transaction-form'),
    amountInput:     document.getElementById('amount'),
    categorySelect:  document.getElementById('category'),
    dateInput:       document.getElementById('date'),
    memoInput:       document.getElementById('memo'),
    totalIncome:        document.getElementById('total-income'),
    totalExpense:       document.getElementById('total-expense'),
    totalBalance:       document.getElementById('total-balance'),
    cumulativeBalance:  document.getElementById('cumulative-balance'),
    btnExportJson:      document.getElementById('btn-export-json'),
    importFileInput:    document.getElementById('import-file-input'),
    transactionList: document.getElementById('transaction-list'),
    listEmpty:       document.getElementById('list-empty'),
    chartEmpty:      document.getElementById('chart-empty'),
    filterType:      document.getElementById('filter-type'),
    btnClearAll:     document.getElementById('btn-clear-all'),
    toggleBtns:      document.querySelectorAll('.toggle-btn'),
    amountKorean:    document.getElementById('amount-korean'),
    // --- 카테고리 관리 모달 관련 ---
    btnCategoryManage: document.getElementById('btn-category-manage'),
    modalOverlay:      document.getElementById('modal-overlay'),
    modalClose:        document.getElementById('modal-close'),
    modalTabs:         document.querySelectorAll('.modal-tab'),
    modalCatList:      document.getElementById('modal-cat-list'),
    newCatIcon:        document.getElementById('new-cat-icon'),
    newCatIconBtn:     document.getElementById('new-cat-icon-btn'),
    newCatIconPreview: document.getElementById('new-cat-icon-preview'),
    newCatName:        document.getElementById('new-cat-name'),
    newCatColor:       document.getElementById('new-cat-color'),
    newCatColorBtn:    document.getElementById('new-cat-color-btn'),
    newCatColorDot:    document.getElementById('new-cat-color-dot'),
    btnAddCat:         document.getElementById('btn-add-cat'),
    // --- 이모지 피커 관련 ---
    emojiPicker:       document.getElementById('emoji-picker'),
    emojiTabs:         document.getElementById('emoji-tabs'),
    emojiGrid:         document.getElementById('emoji-grid'),
    // --- 거래 내역 뷰 모드 + 기간 필터 ---
    viewTabs:          document.querySelectorAll('.view-tab'),
    // 일별 필터
    filterDaily:       document.getElementById('filter-daily'),
    datePick:          document.getElementById('date-pick'),
    dayPrev:           document.getElementById('day-prev'),
    dayNext:           document.getElementById('day-next'),
    // 월별 필터
    filterMonthly:     document.getElementById('filter-monthly'),
    monthPrev:         document.getElementById('month-prev'),
    monthNext:         document.getElementById('month-next'),
    monthLabel:        document.getElementById('month-label'),
    // 년도별 필터
    filterYearly:      document.getElementById('filter-yearly'),
    yearPrev:          document.getElementById('year-prev'),
    yearNext:          document.getElementById('year-next'),
    yearLabel:         document.getElementById('year-label'),
    // 월 드롭다운
    monthDropdown:     document.getElementById('month-dropdown'),
    dropdownYearPrev:  document.getElementById('dropdown-year-prev'),
    dropdownYearNext:  document.getElementById('dropdown-year-next'),
    dropdownYearLabel: document.getElementById('dropdown-year-label'),
    monthGrid:         document.getElementById('month-grid'),
    // --- 보고서 관련 ---
    reportPanel:       document.getElementById('report-panel'),
    reportTitle:       document.getElementById('report-title'),
    reportPrev:        document.getElementById('report-prev'),
    reportNext:        document.getElementById('report-next'),
    btnExportPdf:      document.getElementById('btn-export-pdf'),
    rptMonthExpense:   document.getElementById('rpt-month-expense'),
    rptVsLast:         document.getElementById('rpt-vs-last'),
    rptDailyAvg:       document.getElementById('rpt-daily-avg'),
    rptTopCat:         document.getElementById('rpt-top-cat'),
    rankingList:       document.getElementById('ranking-list'),
};

// ============================================================
// 4. 숫자 포맷팅 유틸리티
// ============================================================

/**
 * 숫자를 한국 원화 형식으로 변환 (예: 15000 → "15,000원")
 * toLocaleString('ko-KR')이 천 단위 콤마를 자동으로 추가해줌
 * @param {number} num - 변환할 숫자
 * @returns {string} 포맷팅된 문자열
 */
function formatMoney(num) {
    return num.toLocaleString('ko-KR') + '원';
}

/**
 * 숫자를 한글 금액 표기로 변환 (1만원 이상일 때만)
 * 예: 15000 → "1만5천원", 1230000 → "123만원", 150000000 → "1억5천만원"
 *
 * 한국어 숫자 단위 체계:
 *   억(1_0000_0000) → 만(1_0000) → 천(1000) 순서로 분해
 *   각 단위에 해당하는 값이 있을 때만 문자열에 포함
 *
 * @param {number} num - 변환할 숫자
 * @returns {string} 한글 금액 문자열 (1만 미만이면 빈 문자열)
 */
function formatKorean(num) {
    // 1만원 미만은 한글 표기가 오히려 복잡해지므로 표시하지 않음
    if (num < 10000) return '';

    let result = '';
    let remaining = num;

    // --- 억 단위 (1억 = 100,000,000) ---
    const eok = Math.floor(remaining / 100000000);
    if (eok > 0) {
        result += eok + '억';
        remaining %= 100000000;
    }

    // --- 만 단위 (1만 = 10,000) ---
    const man = Math.floor(remaining / 10000);
    if (man > 0) {
        result += man + '만';
        remaining %= 10000;
    }

    // --- 천 단위 (1천 = 1,000) ---
    const cheon = Math.floor(remaining / 1000);
    if (cheon > 0) {
        result += cheon + '천';
        remaining %= 1000;
    }

    // 나머지 (백 단위 이하)가 있으면 숫자 그대로 붙임
    // 예: 15,500 → "1만5천500원"
    if (remaining > 0) {
        result += remaining;
    }

    return result + '원';
}

// ============================================================
// 5. 카테고리 관련 헬퍼 함수
// ============================================================

/**
 * 카테고리 이름으로 해당 카테고리 객체를 찾아 반환
 * 수입/지출 양쪽 카테고리를 모두 검색함
 * @param {string} name - 찾을 카테고리 이름
 * @returns {Object} { name, icon, color } 형태의 카테고리 객체
 */
function findCategory(name) {
    const all = [...CATEGORIES.expense, ...CATEGORIES.income];
    return all.find(c => c.name === name) || { name, icon: '❓', color: '#888' };
}

/**
 * 현재 선택된 유형(수입/지출)에 맞는 카테고리 옵션을 select에 채움
 * 유형이 바뀔 때마다 호출되어 카테고리 목록을 갱신
 */
function populateCategories() {
    const categories = CATEGORIES[currentType];
    DOM.categorySelect.innerHTML = categories
        .map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`)
        .join('');
}

// ============================================================
// 6. 요약 카드 업데이트
// ============================================================

/**
 * 모든 거래 내역을 순회하며 총 수입, 총 지출, 잔액을 계산하고
 * 화면의 요약 카드에 반영함
 */
function updateSummary() {
    // 이번 달의 년-월 문자열 (YYYY-MM)
    const now = new Date();
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 이번 달 수입/지출 합산
    const monthly = transactions
        .filter(tx => tx.date.startsWith(thisMonthStr))
        .reduce(
            (acc, tx) => {
                if (tx.type === 'income') acc.income += tx.amount;
                else acc.expense += tx.amount;
                return acc;
            },
            { income: 0, expense: 0 }
        );

    // 전체 누적 잔액 (수입 - 지출)
    const cumulative = transactions.reduce(
        (acc, tx) => {
            if (tx.type === 'income') acc.income += tx.amount;
            else acc.expense += tx.amount;
            return acc;
        },
        { income: 0, expense: 0 }
    );

    // 이번 달 카드 업데이트
    const monthBalance = monthly.income - monthly.expense;
    DOM.totalIncome.textContent = formatMoney(monthly.income);
    DOM.totalExpense.textContent = formatMoney(monthly.expense);
    DOM.totalBalance.textContent = formatMoney(monthBalance);

    // 전체 누적 잔액 업데이트
    const totalBalance = cumulative.income - cumulative.expense;
    DOM.cumulativeBalance.textContent = formatMoney(totalBalance);
}

// ============================================================
// 7. 거래 내역 리스트 렌더링 (일별 / 월별 / 년도별 뷰)
// ============================================================

/**
 * 필터링 + 기간 + 정렬이 적용된 거래 내역 배열을 반환하는 헬퍼
 * 여러 렌더 함수에서 공통으로 사용
 * @returns {Array} 필터 조건에 맞는 정렬된 거래 배열
 */
function getFilteredTransactions() {
    let result = transactions;

    // 수입/지출 타입 필터
    if (currentFilter !== 'all') {
        result = result.filter(tx => tx.type === currentFilter);
    }

    // 뷰 모드별 기간 필터 적용
    if (currentView === 'daily') {
        // 일별: 선택된 하루만 표시
        result = result.filter(tx => tx.date === selectedDate);
    } else if (currentView === 'monthly') {
        // 월별: 선택된 년-월만 표시
        const prefix = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
        result = result.filter(tx => tx.date.startsWith(prefix));
    } else if (currentView === 'yearly') {
        // 년도별: 선택된 연도만 표시
        result = result.filter(tx => tx.date.startsWith(String(selectedViewYear)));
    }

    // 날짜 내림차순 정렬 (같은 날짜면 추가된 순서 역순)
    return [...result].sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        return dateDiff !== 0 ? dateDiff : b.id - a.id;
    });
}

/**
 * 단일 거래 내역 아이템의 HTML 문자열 생성 (일별/월별에서 공용)
 * @param {Object} tx - 거래 객체
 * @returns {string} HTML 문자열
 */
function renderTxItem(tx) {
    const cat = findCategory(tx.category);
    const sign = tx.type === 'income' ? '+' : '-';
    const memo = tx.memo ? ` · ${tx.memo}` : '';

    return `
        <div class="transaction-item" data-id="${tx.id}">
            <div class="tx-icon ${tx.type}">${cat.icon}</div>
            <div class="tx-info">
                <div class="tx-category">${tx.category}</div>
                <div class="tx-meta">${tx.date}${memo}</div>
            </div>
            <div class="tx-amount ${tx.type}">${sign}${formatMoney(tx.amount)}</div>
            <button class="tx-delete" onclick="deleteTransaction(${tx.id})" title="삭제">×</button>
        </div>
    `;
}

/**
 * 그룹별 소계(수입/지출)를 HTML로 렌더링
 * @param {Array} items - 해당 그룹에 속하는 거래 배열
 * @returns {string} "+1,000원 / -5,000원" 같은 HTML
 */
function renderGroupTotals(items) {
    const inc = items.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = items.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const parts = [];
    if (inc > 0) parts.push(`<span class="income">+${formatMoney(inc)}</span>`);
    if (exp > 0) parts.push(`<span class="expense">-${formatMoney(exp)}</span>`);
    return parts.join(' ');
}

/**
 * 일별 보기: 선택된 하루의 내역을 그대로 렌더링
 * (이미 하루 단위로 필터링되어 있으므로 그룹핑 불필요)
 */
function renderDailyView(sorted) {
    // 하루의 소계를 상단에 표시
    const d = new Date(selectedDate + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;

    let html = `
        <div class="date-group-header">
            <span class="date-group-label">${label}</span>
            <span class="date-group-total">${renderGroupTotals(sorted)}</span>
        </div>
    `;
    html += sorted.map(renderTxItem).join('');
    return html;
}

/**
 * 월별 보기: 년-월 별로 그룹핑하여 헤더 + 내역 목록 렌더링
 */
function renderMonthlyView(sorted) {
    const groups = new Map();
    sorted.forEach(tx => {
        // "2026-03" 같은 년-월 키로 그룹핑
        const key = tx.date.substring(0, 7);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tx);
    });

    let html = '';
    groups.forEach((items, yearMonth) => {
        const [y, m] = yearMonth.split('-');
        const label = `${y}년 ${parseInt(m)}월`;

        html += `
            <div class="date-group-header">
                <span class="date-group-label">${label}</span>
                <span class="date-group-total">${renderGroupTotals(items)}</span>
            </div>
        `;
        html += items.map(renderTxItem).join('');
    });

    return html;
}

/**
 * 년도별 보기: 선택된 연도의 요약 대시보드를 렌더링
 * (getFilteredTransactions에서 이미 selectedViewYear로 필터링됨)
 */
function renderYearlyView(sorted) {
    const items = sorted;

    // 수입/지출 합산
    const totalIncome  = items.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = items.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;

    // 가장 많이 쓴 지출 카테고리
    const expByCat = {};
    items.filter(t => t.type === 'expense').forEach(t => {
        expByCat[t.category] = (expByCat[t.category] || 0) + t.amount;
    });
    const topExpense = Object.entries(expByCat).sort((a, b) => b[1] - a[1])[0];

    // 가장 많은 수입 카테고리
    const incByCat = {};
    items.filter(t => t.type === 'income').forEach(t => {
        incByCat[t.category] = (incByCat[t.category] || 0) + t.amount;
    });
    const topIncome = Object.entries(incByCat).sort((a, b) => b[1] - a[1])[0];

    // 인사이트 문구
    let insights = '';
    if (topExpense) {
        const cat = findCategory(topExpense[0]);
        insights += `<p>${cat.icon} <strong>${topExpense[0]}</strong>에 가장 많은 돈을 썼어요 (${formatMoney(topExpense[1])})</p>`;
    }
    if (topIncome) {
        const cat = findCategory(topIncome[0]);
        insights += `<p>${cat.icon} <strong>${topIncome[0]}</strong>으로 가장 많은 수입이 생겼어요 (${formatMoney(topIncome[1])})</p>`;
    }

    return `
        <div class="year-summary">
            <div class="year-summary-grid">
                <div class="year-stat">
                    <span class="year-stat-label">총 수입</span>
                    <span class="year-stat-value income">${formatMoney(totalIncome)}</span>
                </div>
                <div class="year-stat">
                    <span class="year-stat-label">총 지출</span>
                    <span class="year-stat-value expense">${formatMoney(totalExpense)}</span>
                </div>
                <div class="year-stat">
                    <span class="year-stat-label">잔액</span>
                    <span class="year-stat-value balance">${formatMoney(balance)}</span>
                </div>
                <div class="year-stat">
                    <span class="year-stat-label">거래 건수</span>
                    <span class="year-stat-value">${items.length}건</span>
                </div>
            </div>
            ${insights ? `<div class="year-insight">${insights}</div>` : ''}
        </div>
    `;
}

/**
 * 메인 렌더 함수: 현재 뷰 모드에 따라 적절한 렌더 함수를 호출
 */
function renderTransactions() {
    const sorted = getFilteredTransactions();

    // 내역이 없으면 빈 상태 메시지 표시
    if (sorted.length === 0) {
        DOM.listEmpty.classList.remove('hidden');
        DOM.transactionList.innerHTML = '';
        DOM.transactionList.appendChild(DOM.listEmpty);
        return;
    }

    DOM.listEmpty.classList.add('hidden');

    // 현재 뷰 모드에 따라 렌더링 방식 분기
    switch (currentView) {
        case 'daily':
            DOM.transactionList.innerHTML = renderDailyView(sorted);
            break;
        case 'monthly':
            DOM.transactionList.innerHTML = renderMonthlyView(sorted);
            break;
        case 'yearly':
            DOM.transactionList.innerHTML = renderYearlyView(sorted);
            break;
    }
}

// ============================================================
// 8. Chart.js 원형 차트 (카테고리별 지출 비율)
// ============================================================

// 차트 인스턴스를 전역 변수로 관리 (업데이트/파괴 시 필요)
let expenseChart = null;

/**
 * 지출 내역만 추출하여 카테고리별로 집계한 뒤 원형 차트로 그림
 * - 지출 데이터가 없으면 차트를 숨기고 안내 메시지를 표시
 * - 이미 차트가 있으면 파괴(destroy) 후 새로 생성
 *   (Chart.js는 같은 canvas에 중복 생성 시 에러 발생)
 */
function updateChart() {
    // 지출 내역만 필터링
    const expenses = transactions.filter(tx => tx.type === 'expense');

    // 지출 데이터가 없으면 차트 숨기기
    if (expenses.length === 0) {
        DOM.chartEmpty.classList.remove('hidden');
        if (expenseChart) {
            expenseChart.destroy();
            expenseChart = null;
        }
        return;
    }

    DOM.chartEmpty.classList.add('hidden');

    // 카테고리별 지출 합계를 계산 (Map 사용)
    // 예: { '식비': 50000, '교통': 20000, '쇼핑': 35000 }
    const categoryTotals = new Map();
    expenses.forEach(tx => {
        const current = categoryTotals.get(tx.category) || 0;
        categoryTotals.set(tx.category, current + tx.amount);
    });

    // Map을 배열로 변환하고 금액 내림차순 정렬
    const sorted = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]);

    // Chart.js에 전달할 라벨(카테고리명)과 데이터(금액) 배열
    const labels = sorted.map(([name]) => name);
    const data = sorted.map(([, amount]) => amount);
    // 각 카테고리에 매칭되는 색상 배열
    const colors = sorted.map(([name]) => findCategory(name).color);

    // 기존 차트가 있으면 파괴 (메모리 누수 방지)
    if (expenseChart) {
        expenseChart.destroy();
    }

    // Chart.js로 새 원형 차트(Doughnut) 생성
    // Doughnut은 Pie의 변형으로, 가운데가 비어있어 더 세련된 느낌
    const ctx = document.getElementById('expense-chart').getContext('2d');
    expenseChart = new Chart(ctx, {
        type: 'doughnut',   // 'pie'도 가능하지만 doughnut이 더 모던한 느낌
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                // 각 조각의 테두리 색상을 배경과 동일하게 하여 깔끔한 느낌
                borderColor: '#FFFFFF',
                borderWidth: 3,
                hoverBorderColor: '#F5F5F7',
                hoverBorderWidth: 2,
                // 조각 사이 간격 (padding)
                spacing: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            // cutout: 도넛 가운데 구멍의 크기 (퍼센트)
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#6B7280',
                        font: {
                            family: "'Noto Sans KR', sans-serif",
                            size: 12,
                        },
                        padding: 16,
                        // 범례 아이콘을 원형으로 표시
                        usePointStyle: true,
                        pointStyleWidth: 10,
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(26, 26, 46, 0.9)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    padding: 12,
                    cornerRadius: 10,
                    titleFont: {
                        family: "'Noto Sans KR', sans-serif",
                        weight: '600',
                    },
                    bodyFont: {
                        family: "'Noto Sans KR', sans-serif",
                    },
                    callbacks: {
                        // 툴팁에 금액과 퍼센트를 동시에 표시
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const value = context.parsed;
                            const percent = ((value / total) * 100).toFixed(1);
                            return ` ${context.label}: ${formatMoney(value)} (${percent}%)`;
                        },
                    },
                },
            },
            // 차트 등장 애니메이션
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 600,
            },
        },
    });
}

// ============================================================
// 8-2. 이번 달 지출 보고서 (A + B + C + D)
// ============================================================

// 보고서 차트 인스턴스 (업데이트 시 파괴 필요)
let dailyBarChart = null;
let compareChart = null;

/**
 * 이번 달 지출 보고서를 렌더링
 * A: 요약 카드 (이번 달 지출, 지난 달 대비, 일 평균, 최다 카테고리)
 * B: 일별 지출 추이 막대 차트
 * C: 카테고리별 지출 랭킹 (가로 막대)
 * D: 지난 달 vs 이번 달 비교 차트
 */
function updateReport() {
    const rYear = reportYear;
    const rMonth = reportMonth; // 0-indexed

    // 선택된 달/지난 달의 년-월 문자열 (YYYY-MM)
    const thisMonthStr = `${rYear}-${String(rMonth + 1).padStart(2, '0')}`;
    const lastDate = new Date(rYear, rMonth, 0); // 지난 달 마지막 날
    const lastMonthStr = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;

    // 보고서 타이틀에 선택된 년월 표시
    DOM.reportTitle.textContent = `📊 ${rYear}년 ${rMonth + 1}월 지출 보고서`;

    // PDF 버튼 텍스트 업데이트
    DOM.btnExportPdf.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 12L3 7h3V1h4v6h3L8 12z"/>
            <path d="M14 14H2v-2H0v3c0 .6.4 1 1 1h14c.6 0 1-.4 1-1v-3h-2v2z"/>
        </svg>
        PDF 내보내기`;

    // 선택된 달 / 지난 달 지출 내역 필터링
    const thisMonthExpenses = transactions.filter(
        tx => tx.type === 'expense' && tx.date.startsWith(thisMonthStr)
    );
    const lastMonthExpenses = transactions.filter(
        tx => tx.type === 'expense' && tx.date.startsWith(lastMonthStr)
    );

    // ===== A. 수치 요약 카드 =====
    const thisTotal = thisMonthExpenses.reduce((s, t) => s + t.amount, 0);
    const lastTotal = lastMonthExpenses.reduce((s, t) => s + t.amount, 0);

    // 이번 달 총 지출
    DOM.rptMonthExpense.textContent = formatMoney(thisTotal);

    // 지난 달 대비 증감률
    if (lastTotal > 0 && thisTotal > 0) {
        const diff = ((thisTotal - lastTotal) / lastTotal * 100).toFixed(0);
        const sign = diff > 0 ? '+' : '';
        const cls = diff > 0 ? 'rpt-up' : diff < 0 ? 'rpt-down' : 'rpt-neutral';
        DOM.rptVsLast.innerHTML = `<span class="${cls}">${sign}${diff}%</span>`;
    } else if (thisTotal > 0 && lastTotal === 0) {
        DOM.rptVsLast.innerHTML = `<span class="rpt-neutral">비교 데이터 없음</span>`;
    } else {
        DOM.rptVsLast.innerHTML = '-';
    }

    // 일 평균 지출 (해당 월의 경과 일수 또는 전체 일수 기준)
    const now = new Date();
    const isCurrentMonth = rYear === now.getFullYear() && rMonth === now.getMonth();
    const daysInMonth = new Date(rYear, rMonth + 1, 0).getDate();
    const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
    const dailyAvg = thisTotal > 0 ? Math.round(thisTotal / dayOfMonth) : 0;
    DOM.rptDailyAvg.textContent = formatMoney(dailyAvg);

    // 가장 많이 쓴 카테고리
    const catTotals = {};
    thisMonthExpenses.forEach(t => {
        catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
    });
    const topCatEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
    if (topCatEntry) {
        const cat = findCategory(topCatEntry[0]);
        DOM.rptTopCat.textContent = `${cat.icon} ${topCatEntry[0]}`;
    } else {
        DOM.rptTopCat.textContent = '-';
    }

    // ===== B. 일별 지출 추이 막대 차트 =====
    renderDailyBarChart(thisMonthExpenses, rYear, rMonth);

    // ===== C. 카테고리별 지출 랭킹 =====
    renderCategoryRanking(catTotals, thisTotal);

    // ===== D. 지난 달 vs 이번 달 비교 차트 =====
    renderCompareChart(thisMonthExpenses, lastMonthExpenses, rYear, rMonth);
}

/**
 * B. 일별 지출 추이 막대 차트
 * X축: 1일~말일, Y축: 해당 날짜의 지출 합계
 * @param {Array} expenses - 이번 달 지출 내역
 * @param {number} year - 년도
 * @param {number} month - 월 (0-indexed)
 */
function renderDailyBarChart(expenses, year, month) {
    // 해당 달의 일수 계산 (예: 3월이면 31)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const today = isCurrentMonth ? now.getDate() : daysInMonth;

    // 1일~말일까지 각 날짜별 지출 합계
    const dailyData = Array(daysInMonth).fill(0);
    expenses.forEach(tx => {
        const day = parseInt(tx.date.split('-')[2], 10);
        dailyData[day - 1] += tx.amount;
    });

    // X축 라벨: 1, 2, 3, ..., 31
    const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // 막대 색상: 경과일까지는 보라색, 미래(이번 달만)는 회색
    const barColors = labels.map((day) =>
        day <= today ? 'rgba(108, 92, 231, 0.7)' : 'rgba(108, 92, 231, 0.15)'
    );

    if (dailyBarChart) dailyBarChart.destroy();

    const ctx = document.getElementById('daily-bar-chart').getContext('2d');
    dailyBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: dailyData,
                backgroundColor: barColors,
                borderRadius: 4,
                borderSkipped: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(26, 26, 46, 0.9)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    cornerRadius: 8,
                    titleFont: { family: "'Noto Sans KR', sans-serif" },
                    bodyFont: { family: "'Noto Sans KR', sans-serif" },
                    callbacks: {
                        title: (items) => `${month + 1}월 ${items[0].label}일`,
                        label: (item) => ` 지출: ${formatMoney(item.parsed.y)}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#6B7280',
                        font: { size: 10 },
                        // 5일 간격으로만 라벨 표시 (너무 촘촘하지 않게)
                        callback: (val, i) => (i + 1) % 5 === 0 || i === 0 ? i + 1 : '',
                    },
                },
                y: {
                    grid: { color: 'rgba(0, 0, 0, 0.04)' },
                    ticks: {
                        color: '#6B7280',
                        font: { size: 10 },
                        callback: (val) => val >= 10000 ? (val / 10000) + '만' : val,
                    },
                },
            },
        },
    });
}

/**
 * C. 카테고리별 지출 랭킹 (가로 막대 바)
 * @param {Object} catTotals - { 카테고리명: 금액 } 객체
 * @param {number} total - 이번 달 총 지출
 */
function renderCategoryRanking(catTotals, total) {
    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
        DOM.rankingList.innerHTML = '<p class="report-empty">이번 달 지출 내역이 없습니다</p>';
        return;
    }

    // 1위 금액을 기준으로 바의 너비 비율을 계산 (1위가 100%)
    const maxAmount = sorted[0][1];

    DOM.rankingList.innerHTML = sorted.map(([name, amount], i) => {
        const cat = findCategory(name);
        const percent = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
        const barWidth = maxAmount > 0 ? ((amount / maxAmount) * 100).toFixed(1) : 0;

        return `
            <div class="ranking-item">
                <span class="ranking-rank">${i + 1}</span>
                <span class="ranking-icon">${cat.icon}</span>
                <div class="ranking-info">
                    <div class="ranking-name">${name}</div>
                    <div class="ranking-bar-bg">
                        <div class="ranking-bar" style="width:${barWidth}%; background:${cat.color};"></div>
                    </div>
                </div>
                <span class="ranking-amount">${formatMoney(amount)}<span class="ranking-percent">${percent}%</span></span>
            </div>
        `;
    }).join('');
}

/**
 * D. 지난 달 vs 이번 달 비교 차트 (누적 지출 라인 차트)
 * 같은 날짜(1일~N일)까지의 누적 지출을 비교하여 두 선으로 표시
 * @param {Array} thisExpenses - 이번 달 지출
 * @param {Array} lastExpenses - 지난 달 지출
 * @param {number} year - 년도
 * @param {number} month - 월 (0-indexed)
 */
function renderCompareChart(thisExpenses, lastExpenses, year, month) {
    // 이번 달 일수
    const daysThis = new Date(year, month + 1, 0).getDate();
    // 지난 달 일수
    const daysLast = new Date(year, month, 0).getDate();
    const maxDays = Math.max(daysThis, daysLast);

    // 각 월의 일별 지출을 누적으로 계산
    const thisDaily = Array(maxDays).fill(0);
    const lastDaily = Array(maxDays).fill(0);

    thisExpenses.forEach(tx => {
        const day = parseInt(tx.date.split('-')[2], 10);
        if (day <= maxDays) thisDaily[day - 1] += tx.amount;
    });
    lastExpenses.forEach(tx => {
        const day = parseInt(tx.date.split('-')[2], 10);
        if (day <= maxDays) lastDaily[day - 1] += tx.amount;
    });

    // 누적합 계산
    for (let i = 1; i < maxDays; i++) {
        thisDaily[i] += thisDaily[i - 1];
        lastDaily[i] += lastDaily[i - 1];
    }

    const labels = Array.from({ length: maxDays }, (_, i) => i + 1);

    // 지난 달 이름
    const lastMonthName = month === 0 ? '12' : String(month);

    if (compareChart) compareChart.destroy();

    const ctx = document.getElementById('compare-chart').getContext('2d');
    compareChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `${month + 1}월 (이번 달)`,
                    data: thisDaily,
                    borderColor: '#6c5ce7',
                    backgroundColor: 'rgba(108, 92, 231, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                },
                {
                    label: `${lastMonthName}월 (지난 달)`,
                    data: lastDaily,
                    borderColor: '#8395a7',
                    backgroundColor: 'rgba(131, 149, 167, 0.05)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    borderWidth: 2,
                    borderDash: [5, 3],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    align: 'end',
                    labels: {
                        color: '#6B7280',
                        font: { family: "'Noto Sans KR', sans-serif", size: 11 },
                        boxWidth: 12,
                        padding: 12,
                        usePointStyle: true,
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(26, 26, 46, 0.9)',
                    titleColor: '#FFFFFF',
                    bodyColor: '#FFFFFF',
                    cornerRadius: 8,
                    titleFont: { family: "'Noto Sans KR', sans-serif" },
                    bodyFont: { family: "'Noto Sans KR', sans-serif" },
                    callbacks: {
                        title: (items) => `${items[0].label}일까지 누적`,
                        label: (item) => ` ${item.dataset.label}: ${formatMoney(item.parsed.y)}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#6B7280',
                        font: { size: 10 },
                        callback: (val, i) => (i + 1) % 5 === 0 || i === 0 ? i + 1 : '',
                    },
                },
                y: {
                    grid: { color: 'rgba(0, 0, 0, 0.04)' },
                    ticks: {
                        color: '#6B7280',
                        font: { size: 10 },
                        callback: (val) => val >= 10000 ? (val / 10000) + '만' : val,
                    },
                },
            },
        },
    });
}

// ============================================================
// 9. 거래 추가/삭제 기능
// ============================================================

/**
 * 새로운 거래 내역을 추가
 * - 폼 데이터를 수집하여 거래 객체를 생성
 * - transactions 배열에 추가 후 LocalStorage에 저장
 * - UI 전체를 갱신 (요약, 리스트, 차트)
 * @param {Event} e - 폼 submit 이벤트
 */
function addTransaction(e) {
    e.preventDefault(); // 폼 기본 동작(페이지 새로고침) 방지

    // 콤마가 포함된 문자열에서 순수 숫자만 추출
    const amount = parseAmountInput(DOM.amountInput.value);

    // 금액이 0 이하이면 무시
    if (!amount || amount <= 0) return;

    // 새 거래 객체 생성
    // id는 현재 타임스탬프를 사용 (간단한 고유 식별자)
    const transaction = {
        id: Date.now(),
        type: currentType,
        amount: amount,
        category: DOM.categorySelect.value,
        date: DOM.dateInput.value,
        memo: DOM.memoInput.value.trim(),
    };

    // 배열에 추가하고 LocalStorage에 저장
    transactions.push(transaction);
    saveTransactions(transactions);

    // UI 전체 갱신
    updateSummary();
    renderTransactions();
    updateChart();
    updateReport();

    // 폼 초기화 (금액과 메모만 비움, 카테고리와 날짜는 유지)
    DOM.amountInput.value = '';
    DOM.memoInput.value = '';
    DOM.amountKorean.textContent = '';
    DOM.amountInput.focus(); // 연속 입력 편의를 위해 금액 필드에 포커스
}

/**
 * 특정 ID의 거래 내역을 삭제
 * - 확인 대화상자를 띄워 실수 방지
 * @param {number} id - 삭제할 거래의 고유 ID (타임스탬프)
 */
function deleteTransaction(id) {
    if (!confirm('이 내역을 삭제하시겠습니까?')) return;

    // 해당 ID를 가진 거래를 배열에서 제거
    transactions = transactions.filter(tx => tx.id !== id);
    saveTransactions(transactions);

    // UI 갱신
    updateSummary();
    renderTransactions();
    updateChart();
    updateReport();
}

/**
 * 모든 거래 내역을 삭제 (전체 삭제 버튼)
 * - 이중 확인으로 실수 방지
 */
function clearAllTransactions() {
    if (transactions.length === 0) return;
    if (!confirm('모든 거래 내역을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    transactions = [];
    saveTransactions(transactions);

    updateSummary();
    renderTransactions();
    updateChart();
    updateReport();
}

// ============================================================
// 10. 금액 입력 필드 자동 콤마 포맷팅
// ============================================================
// 사용자가 숫자를 입력할 때마다 천 단위 콤마를 자동 삽입
// 예: 1000 → 1,000 / 1500000 → 1,500,000
// input 타입을 text로 바꾸고, 숫자 외 문자는 제거하는 방식

/**
 * 금액 입력 필드에서 숫자만 추출하여 반환
 * 콤마와 '원' 같은 비숫자 문자를 모두 제거
 * @param {string} str - 입력 필드의 현재 값
 * @returns {number} 순수 숫자 값 (0 이상)
 */
function parseAmountInput(str) {
    const num = parseInt(str.replace(/[^\d]/g, ''), 10);
    return isNaN(num) ? 0 : num;
}

/**
 * 숫자를 콤마가 포함된 문자열로 변환
 * 예: 15000 → "15,000"
 * @param {number} num - 변환할 숫자
 * @returns {string} 콤마가 포함된 문자열
 */
function formatWithComma(num) {
    return num.toLocaleString('ko-KR');
}

// 금액 입력 필드에 키 입력이 발생할 때마다 콤마 포맷 적용
DOM.amountInput.addEventListener('input', () => {
    const rawValue = DOM.amountInput.value;
    const num = parseAmountInput(rawValue);

    if (num === 0) {
        // 아무것도 입력 안 했거나 0이면 필드를 비움
        DOM.amountInput.value = '';
        DOM.amountKorean.textContent = '';
        return;
    }

    // 커서 위치 보정: 콤마가 추가/제거되면 커서가 밀릴 수 있으므로
    // 포맷팅 전후의 길이 차이를 계산하여 커서를 올바른 위치에 놓음
    const cursorPos = DOM.amountInput.selectionStart;
    const beforeLength = rawValue.length;
    const formatted = formatWithComma(num);
    DOM.amountInput.value = formatted;
    const afterLength = formatted.length;

    // 커서 위치를 길이 변화만큼 조정 (콤마가 추가되면 오른쪽으로 밀림)
    const newCursor = cursorPos + (afterLength - beforeLength);
    DOM.amountInput.setSelectionRange(newCursor, newCursor);

    // 1만원 이상이면 한글 금액 표시 (예: "1만5천원")
    DOM.amountKorean.textContent = formatKorean(num);
});

// ============================================================
// 11. 이모지 피커
// ============================================================
// 가계부에서 자주 사용할 만한 이모지를 카테고리별로 정리
// 사용자가 마우스 클릭만으로 이모지를 선택할 수 있게 해줌

/**
 * 이모지 데이터: 카테고리별 이모지 배열
 * 탭 아이콘(tabIcon)과 이름(name), 이모지 목록(emojis)으로 구성
 */
const EMOJI_DATA = [
    {
        name: '자주 쓰는',
        tabIcon: '⭐',
        emojis: ['💰','💵','💸','🍔','🚌','🛍️','🏠','📱','💊','🎬','📚','🎁','📈','✨','🤑','💳','🧾','🪙','💎','🎯','❤️','🔥','⚡','🌟'],
    },
    {
        name: '음식',
        tabIcon: '🍔',
        emojis: ['🍔','🍕','🍜','🍛','🍱','🍣','🍰','☕','🍺','🥤','🍳','🥗','🌮','🍝','🍩','🧁','🍇','🍎','🥐','🍻','🥩','🍖','🧀','🥚'],
    },
    {
        name: '교통',
        tabIcon: '🚗',
        emojis: ['🚗','🚌','🚇','🚕','🚲','✈️','🚀','⛽','🛵','🏍️','🚂','🚁','⛵','🚢','🛴','🚡','🛻','🚒','🚑','🚓','🛤️','🛣️','🅿️','🔧'],
    },
    {
        name: '쇼핑',
        tabIcon: '🛍️',
        emojis: ['🛍️','👗','👟','💄','👜','🎒','👔','👠','🧢','💍','⌚','🕶️','👕','👖','🧥','🧤','🧣','👒','💅','🎀','🪮','👙','🩴','🧴'],
    },
    {
        name: '집/생활',
        tabIcon: '🏠',
        emojis: ['🏠','🏢','🛋️','🛏️','🚿','🧹','🧺','💡','🔑','🏗️','🪴','🛁','🪑','📦','🧯','🔨','🪛','🪣','🧲','🪞','🧸','🕯️','🖼️','🏡'],
    },
    {
        name: '건강/의료',
        tabIcon: '💊',
        emojis: ['💊','🏥','🩺','🩹','💉','🧬','🦷','👓','🏋️','🧘','🚴','🏃','🩻','🩸','🧪','🌡️','😷','🤒','💪','🧠','❤️‍🩹','🫀','🫁','🦴'],
    },
    {
        name: '문화/여가',
        tabIcon: '🎬',
        emojis: ['🎬','🎮','🎵','📖','🎨','🎪','🎭','🎤','🎸','🎹','🎧','📷','🎻','🎺','🥁','🎲','🎰','🎳','🎯','🧩','🎠','🎡','🎢','🎟️'],
    },
    {
        name: '돈/금융',
        tabIcon: '💰',
        emojis: ['💰','💵','💴','💶','💷','💸','💳','🏦','📊','📈','📉','🪙','💎','🧾','🏧','💹','🤑','🏛️','⚖️','📑','📋','✍️','🖊️','📌'],
    },
    {
        name: '자연/날씨',
        tabIcon: '🌈',
        emojis: ['🌈','☀️','🌙','⭐','🌧️','❄️','🌸','🌺','🍀','🌴','🌊','🔥','⚡','🌍','🌻','🍁','🍂','🌵','🦋','🐾','🌹','💐','🪻','🍄'],
    },
    {
        name: '표정/기호',
        tabIcon: '😊',
        emojis: ['😊','😍','🥳','😎','🤔','😢','😡','🥰','💀','👻','🎉','✅','❌','⚠️','💯','🔔','📌','🏷️','🚩','💬','🫶','🙌','👍','🫡'],
    },
];

// 현재 이모지 피커가 열린 상태인지, 어떤 타겟(버튼)에 대해 열렸는지 추적
let emojiPickerTarget = null;  // 이모지를 선택하면 이 콜백이 호출됨
let currentEmojiTab = 0;       // 현재 선택된 탭 인덱스

/**
 * 이모지 피커의 탭 바를 렌더링
 * 각 카테고리의 대표 이모지를 탭 버튼으로 표시
 */
function renderEmojiTabs() {
    DOM.emojiTabs.innerHTML = EMOJI_DATA.map((group, i) =>
        `<button class="emoji-tab-btn ${i === currentEmojiTab ? 'active' : ''}"
                 data-index="${i}" title="${group.name}">${group.tabIcon}</button>`
    ).join('');
}

/**
 * 이모지 그리드를 렌더링
 * @param {number|null} tabIndex - 특정 탭만 표시 (null이면 전체)
 */
function renderEmojiGrid(tabIndex) {
    const groups = tabIndex !== null ? [EMOJI_DATA[tabIndex]] : EMOJI_DATA;

    DOM.emojiGrid.innerHTML = groups.map(group => `
        <div class="emoji-group-title">${group.name}</div>
        <div class="emoji-group-grid">
            ${group.emojis.map(e => `<button class="emoji-btn" type="button">${e}</button>`).join('')}
        </div>
    `).join('');
}

/**
 * 이모지 피커를 특정 버튼 근처에 열기
 * @param {HTMLElement} anchorEl - 피커를 표시할 기준 요소
 * @param {Function} onSelect - 이모지를 선택했을 때 호출할 콜백 (emoji) => void
 */
function openEmojiPicker(anchorEl, onSelect) {
    emojiPickerTarget = onSelect;
    currentEmojiTab = 0;

    renderEmojiTabs();
    renderEmojiGrid(0);

    // 기준 요소의 위치를 기반으로 피커 위치 결정
    const rect = anchorEl.getBoundingClientRect();
    const picker = DOM.emojiPicker;

    picker.classList.add('open');

    // 피커가 화면 아래로 벗어나면 위쪽에 표시
    const pickerHeight = 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < pickerHeight
        ? Math.max(8, rect.top - pickerHeight - 4)
        : rect.bottom + 4;

    // 피커가 화면 오른쪽으로 벗어나면 왼쪽으로 밀기
    const pickerWidth = 320;
    const left = Math.min(rect.left, window.innerWidth - pickerWidth - 8);

    picker.style.top = top + 'px';
    picker.style.left = Math.max(8, left) + 'px';
}

/**
 * 이모지 피커를 닫기
 */
function closeEmojiPicker() {
    DOM.emojiPicker.classList.remove('open');
    emojiPickerTarget = null;
}

// --- 이모지 피커 이벤트 리스너 ---

// 탭 클릭 시 해당 카테고리의 이모지만 표시
DOM.emojiTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-tab-btn');
    if (!btn) return;

    currentEmojiTab = parseInt(btn.dataset.index, 10);

    // 탭 활성화 상태 업데이트
    DOM.emojiTabs.querySelectorAll('.emoji-tab-btn').forEach((t, i) => {
        t.classList.toggle('active', i === currentEmojiTab);
    });

    renderEmojiGrid(currentEmojiTab);
});

// 이모지 클릭 시 선택 콜백 호출 후 피커 닫기
DOM.emojiGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (!btn || !emojiPickerTarget) return;

    emojiPickerTarget(btn.textContent);
    closeEmojiPicker();
});

// 피커 바깥 클릭 시 닫기
document.addEventListener('mousedown', (e) => {
    if (!DOM.emojiPicker.classList.contains('open')) return;
    // 피커 내부 클릭은 무시
    if (DOM.emojiPicker.contains(e.target)) return;
    // 이모지 버튼 자체를 클릭한 건 토글로 처리되므로 무시
    if (e.target.closest('.cat-icon-btn')) return;
    closeEmojiPicker();
});

// ============================================================
// 11-2. 색상 팔레트 피커
// ============================================================
// 도넛 차트에서 카테고리를 구분하는 색상을 선택하는 팝업
// 30개의 미리 정의된 색상 중에서 클릭으로 선택

/**
 * 팔레트 색상 목록 (30개)
 * 도넛 차트에서 잘 구분되도록 채도와 밝기를 조절한 색상들
 * 5행 6열 그리드에 맞춰 배치됨
 */
const PALETTE_COLORS = [
    // 빨강~분홍 계열
    '#ff6b6b', '#ee5a24', '#ff9f43', '#f368e0', '#ff9ff3', '#fd79a8',
    // 보라~파랑 계열
    '#6c5ce7', '#a78bfa', '#5f27cd', '#3742fa', '#54a0ff', '#0abde3',
    // 청록~초록 계열
    '#01a3a4', '#00d4aa', '#1abc9c', '#2ed573', '#26de81', '#7bed9f',
    // 노랑~갈색 계열
    '#ffd700', '#ffa502', '#fdcb6e', '#e17055', '#d35400', '#b33939',
    // 회색~중성 계열
    '#8395a7', '#576574', '#c8d6e5', '#dfe6e9', '#74b9ff', '#a29bfe',
];

// 색상 피커 DOM 참조
const colorPickerEl = document.getElementById('color-picker');
const colorPaletteEl = document.getElementById('color-palette');

// 색상 선택 시 호출될 콜백
let colorPickerTarget = null;
// 현재 선택된 색상 (팔레트에서 selected 표시용)
let colorPickerCurrent = '#6c5ce7';

/**
 * 색상 팔레트를 렌더링
 * 현재 선택된 색상에 selected 클래스를 부여
 */
function renderColorPalette() {
    colorPaletteEl.innerHTML = PALETTE_COLORS.map(color =>
        `<button class="color-swatch ${color === colorPickerCurrent ? 'selected' : ''}"
                 style="background:${color};" data-color="${color}" type="button"></button>`
    ).join('');
}

/**
 * 색상 팔레트 피커를 특정 버튼 근처에 열기
 * @param {HTMLElement} anchorEl - 피커를 표시할 기준 요소
 * @param {string} currentColor - 현재 선택된 색상 (selected 표시용)
 * @param {Function} onSelect - 색상을 선택했을 때 호출할 콜백 (color) => void
 */
function openColorPicker(anchorEl, currentColor, onSelect) {
    colorPickerTarget = onSelect;
    colorPickerCurrent = currentColor;

    renderColorPalette();

    // 기준 요소 위치 기반으로 피커 위치 결정
    const rect = anchorEl.getBoundingClientRect();
    colorPickerEl.classList.add('open');

    const pickerHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < pickerHeight
        ? Math.max(8, rect.top - pickerHeight - 4)
        : rect.bottom + 4;

    const pickerWidth = 240;
    const left = Math.min(rect.left, window.innerWidth - pickerWidth - 8);

    colorPickerEl.style.top = top + 'px';
    colorPickerEl.style.left = Math.max(8, left) + 'px';
}

/**
 * 색상 팔레트 피커를 닫기
 */
function closeColorPicker() {
    colorPickerEl.classList.remove('open');
    colorPickerTarget = null;
}

// --- 색상 팔레트 이벤트 리스너 ---

// 스와치 클릭 시 색상 선택 후 피커 닫기
colorPaletteEl.addEventListener('click', (e) => {
    const swatch = e.target.closest('.color-swatch');
    if (!swatch || !colorPickerTarget) return;

    const color = swatch.dataset.color;
    colorPickerTarget(color);
    closeColorPicker();
});

// 피커 바깥 클릭 시 닫기
document.addEventListener('mousedown', (e) => {
    if (!colorPickerEl.classList.contains('open')) return;
    if (colorPickerEl.contains(e.target)) return;
    if (e.target.closest('.cat-color-btn')) return;
    closeColorPicker();
});

// ============================================================
// 12. 카테고리 관리 모달 로직
// ============================================================

// 모달에서 현재 보고 있는 탭 (expense 또는 income)
let modalTab = 'expense';

/**
 * 카테고리 관리 모달을 열기
 * 현재 메인 폼에서 선택된 타입(수입/지출)에 맞는 탭을 자동 선택
 */
function openCategoryModal() {
    // 메인 폼의 현재 타입에 맞는 탭을 활성화
    modalTab = currentType;
    DOM.modalTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === modalTab);
    });
    renderModalCategoryList();
    DOM.modalOverlay.classList.add('open');
}

/**
 * 카테고리 관리 모달을 닫기
 * 입력 필드도 초기화
 */
function closeCategoryModal() {
    DOM.modalOverlay.classList.remove('open');
    closeEmojiPicker();   // 이모지 피커가 열려있으면 같이 닫기
    closeColorPicker();   // 색상 피커가 열려있으면 같이 닫기
    clearModalInputs();
}

/**
 * 모달의 새 카테고리 입력 필드를 비움
 * 이모지 버튼도 초기 상태("+")로 복원
 */
function clearModalInputs() {
    DOM.newCatIcon.value = '';
    DOM.newCatIconPreview.textContent = '+';
    DOM.newCatIconBtn.classList.remove('selected');
    DOM.newCatName.value = '';
    DOM.newCatColor.value = '#6c5ce7';
    DOM.newCatColorDot.style.background = '#6c5ce7';
}

/**
 * 특정 카테고리가 기본(내장) 카테고리인지 확인
 * 기본 카테고리는 삭제할 수 없음 (수정은 가능)
 * - 기본 카테고리 원본 이름과 일치하거나
 * - 기본 카테고리를 오버라이드한 항목이면 기본으로 판정
 * @param {string} type - 'expense' 또는 'income'
 * @param {string} name - 카테고리 이름
 * @returns {boolean} 기본 카테고리이면 true
 */
function isDefaultCategory(type, name) {
    // 원본 기본 이름과 직접 일치
    if (DEFAULT_CATEGORIES[type].some(c => c.name === name)) return true;
    // 기본 카테고리를 오버라이드한 커스텀인지 확인
    // (이름이 바뀌었어도 _overrides 속성이 있으면 기본 카테고리 기반)
    const override = customCategories[type].find(c => c.name === name && c._overrides);
    return !!override;
}

/**
 * 모달 내의 카테고리 목록을 렌더링
 * - 기본 카테고리: "기본" 배지 표시, 삭제 버튼 비활성화
 * - 커스텀 카테고리: 수정/삭제 모두 가능
 */
function renderModalCategoryList() {
    const categories = CATEGORIES[modalTab];

    DOM.modalCatList.innerHTML = categories.map(cat => {
        const isDefault = isDefaultCategory(modalTab, cat.name);

        return `
            <div class="cat-item" data-name="${cat.name}">
                <div class="cat-item-icon" style="background: ${cat.color}22;">
                    ${cat.icon}
                </div>
                <span class="cat-item-name">${cat.name}</span>
                ${isDefault ? '<span class="cat-badge-default">기본</span>' : ''}
                <div class="cat-item-actions">
                    <button class="cat-action-btn edit" onclick="startEditCategory('${cat.name}')" title="수정">
                        ✏️
                    </button>
                    <button class="cat-action-btn delete ${isDefault ? 'disabled' : ''}"
                            onclick="deleteCategory('${cat.name}')" title="${isDefault ? '기본 카테고리는 삭제 불가' : '삭제'}">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 새 커스텀 카테고리를 추가
 * - 이모지, 이름이 비어있으면 무시
 * - 같은 타입 내에서 중복 이름 방지
 */
function addCustomCategory() {
    const icon = DOM.newCatIcon.value.trim();
    const name = DOM.newCatName.value.trim();
    const color = DOM.newCatColor.value;

    // 유효성 검사: 이모지와 이름은 필수
    if (!icon) {
        DOM.newCatIcon.focus();
        return;
    }
    if (!name) {
        DOM.newCatName.focus();
        return;
    }

    // 현재 탭(수입/지출)의 전체 카테고리에서 이름 중복 확인
    if (CATEGORIES[modalTab].some(c => c.name === name)) {
        alert(`"${name}" 카테고리가 이미 존재합니다.`);
        return;
    }

    // 커스텀 카테고리 배열에 추가 후 저장
    customCategories[modalTab].push({ name, icon, color });
    saveCustomCategories(customCategories);

    // CATEGORIES 재구성 및 UI 갱신
    rebuildCategories();
    renderModalCategoryList();
    populateCategories();
    updateChart(); // 차트 색상이 바뀔 수 있으므로 갱신
    renderTransactions(); // 아이콘이 바뀔 수 있으므로 갱신
    updateReport();

    clearModalInputs();
}

/**
 * 카테고리 수정 모드 진입
 * 해당 카테고리 아이템을 인라인 편집 폼으로 교체
 * @param {string} name - 수정할 카테고리 이름
 */
function startEditCategory(name) {
    const cat = CATEGORIES[modalTab].find(c => c.name === name);
    if (!cat) return;

    // 해당 카테고리 아이템 DOM을 찾아서 편집 폼으로 교체
    const item = DOM.modalCatList.querySelector(`.cat-item[data-name="${name}"]`);
    if (!item) return;

    // 고유 ID를 생성하여 편집 폼의 이모지 버튼을 식별
    const editId = 'edit-' + Date.now();

    item.outerHTML = `
        <div class="cat-edit-row" data-original="${name}">
            <button type="button" class="cat-icon-btn selected" id="${editId}-btn" title="이모지 선택">
                <span class="cat-icon-preview" id="${editId}-preview">${cat.icon}</span>
            </button>
            <input type="hidden" class="cat-icon-input" id="${editId}-icon" value="${cat.icon}">
            <input type="text" class="cat-name-input" value="${cat.name}" placeholder="카테고리 이름">
            <button type="button" class="cat-color-btn" id="${editId}-color-btn" title="차트 색상 선택">
                <span class="cat-color-dot" id="${editId}-color-dot" style="background:${cat.color};"></span>
            </button>
            <input type="hidden" class="cat-color-input" id="${editId}-color" value="${cat.color}">
            <div class="cat-edit-actions">
                <button class="btn-edit-save" onclick="saveEditCategory('${name}')">저장</button>
                <button class="btn-edit-cancel" onclick="renderModalCategoryList()">취소</button>
            </div>
        </div>
    `;

    // 편집 폼의 이모지 버튼에 피커 연결
    const editBtn = document.getElementById(`${editId}-btn`);
    const editIcon = document.getElementById(`${editId}-icon`);
    const editPreview = document.getElementById(`${editId}-preview`);

    editBtn.addEventListener('click', () => {
        if (DOM.emojiPicker.classList.contains('open')) {
            closeEmojiPicker();
            return;
        }
        openEmojiPicker(editBtn, (emoji) => {
            editIcon.value = emoji;
            editPreview.textContent = emoji;
        });
    });

    // 편집 폼의 색상 버튼에 팔레트 피커 연결
    const editColorBtn = document.getElementById(`${editId}-color-btn`);
    const editColorDot = document.getElementById(`${editId}-color-dot`);
    const editColorInput = document.getElementById(`${editId}-color`);

    editColorBtn.addEventListener('click', () => {
        if (colorPickerEl.classList.contains('open')) {
            closeColorPicker();
            return;
        }
        openColorPicker(editColorBtn, editColorInput.value, (color) => {
            editColorInput.value = color;
            editColorDot.style.background = color;
        });
    });
}

/**
 * 수정 중인 카테고리를 저장
 * - 기본 카테고리: 수정 내용을 커스텀으로 "오버라이드" 저장
 *   (기본 카테고리 원본은 유지, 오버라이드 데이터로 덮어씀)
 * - 커스텀 카테고리: 직접 수정
 * - 이미 사용 중인 거래 내역의 카테고리 이름도 함께 변경
 * @param {string} originalName - 수정 전 원래 이름
 */
function saveEditCategory(originalName) {
    // 인라인 편집 폼에서 값을 가져옴
    const editRow = DOM.modalCatList.querySelector(`.cat-edit-row[data-original="${originalName}"]`);
    if (!editRow) return;

    const newIcon = editRow.querySelector('.cat-icon-input').value.trim();
    const newName = editRow.querySelector('.cat-name-input').value.trim();
    const newColor = editRow.querySelector('.cat-color-input').value;

    if (!newIcon || !newName) {
        alert('이모지와 이름을 모두 입력해주세요.');
        return;
    }

    // 이름이 변경되었을 때, 다른 카테고리와 중복 확인
    if (newName !== originalName && CATEGORIES[modalTab].some(c => c.name === newName)) {
        alert(`"${newName}" 카테고리가 이미 존재합니다.`);
        return;
    }

    const isDefault = isDefaultCategory(modalTab, originalName);

    if (isDefault) {
        // 기본 카테고리 수정: 기본 원본은 건드리지 않고,
        // "오버라이드" 항목을 커스텀에 추가하여 기본을 대체함
        // 이미 오버라이드가 있으면 업데이트
        const overrideIdx = customCategories[modalTab].findIndex(c => c._overrides === originalName);
        const override = { name: newName, icon: newIcon, color: newColor, _overrides: originalName };

        if (overrideIdx >= 0) {
            customCategories[modalTab][overrideIdx] = override;
        } else {
            customCategories[modalTab].push(override);
        }
    } else {
        // 커스텀 카테고리 수정: 배열에서 직접 찾아서 수정
        const cat = customCategories[modalTab].find(c => c.name === originalName);
        if (cat) {
            cat.name = newName;
            cat.icon = newIcon;
            cat.color = newColor;
        }
    }

    // 카테고리 이름이 변경되었으면, 기존 거래 내역의 카테고리도 업데이트
    if (newName !== originalName) {
        transactions.forEach(tx => {
            if (tx.category === originalName) {
                tx.category = newName;
            }
        });
        saveTransactions(transactions);
    }

    saveCustomCategories(customCategories);
    rebuildCategories();
    renderModalCategoryList();
    populateCategories();
    updateSummary();
    renderTransactions();
    updateChart();
    updateReport();
}

/**
 * 커스텀 카테고리를 삭제
 * - 기본 카테고리는 이 함수가 호출되지 않음 (버튼이 비활성화)
 * - 해당 카테고리를 사용 중인 거래 내역이 있으면 경고
 * @param {string} name - 삭제할 카테고리 이름
 */
function deleteCategory(name) {
    // 기본 카테고리인 경우 (혹시 모를 방어 코드)
    if (isDefaultCategory(modalTab, name)) return;

    // 이 카테고리를 사용 중인 거래가 있는지 확인
    const usedCount = transactions.filter(tx => tx.category === name).length;
    const message = usedCount > 0
        ? `"${name}" 카테고리를 사용 중인 거래가 ${usedCount}건 있습니다.\n삭제하면 해당 거래의 카테고리가 "기타"로 변경됩니다.\n삭제하시겠습니까?`
        : `"${name}" 카테고리를 삭제하시겠습니까?`;

    if (!confirm(message)) return;

    // 커스텀 카테고리 배열에서 제거
    customCategories[modalTab] = customCategories[modalTab].filter(c => c.name !== name);

    // 사용 중인 거래의 카테고리를 "기타지출" 또는 "기타수입"으로 변경
    if (usedCount > 0) {
        const fallback = modalTab === 'expense' ? '기타지출' : '기타수입';
        transactions.forEach(tx => {
            if (tx.category === name) {
                tx.category = fallback;
            }
        });
        saveTransactions(transactions);
    }

    saveCustomCategories(customCategories);
    rebuildCategories();
    renderModalCategoryList();
    populateCategories();
    updateSummary();
    renderTransactions();
    updateChart();
    updateReport();
}

// ============================================================
// CATEGORIES 재구성 시 오버라이드 처리
// ============================================================
// 기본 카테고리를 사용자가 수정하면 _overrides 속성이 있는 객체가
// customCategories에 추가됨. rebuildCategories에서 이를 처리해야 함.

// 기존 rebuildCategories를 오버라이드 처리가 포함된 버전으로 교체
// (원래 함수는 위에서 단순 concat만 했지만, 오버라이드 로직 필요)

// 참고: 이 재정의가 앱 로드 시점에서 위의 rebuildCategories보다 늦게 실행되므로
// init()에서 다시 한 번 rebuildCategories()를 호출해줘야 함

/**
 * [개선된 버전] 기본 카테고리 + 커스텀 카테고리를 합쳐서 CATEGORIES를 재구성
 * - _overrides 속성이 있는 커스텀 항목은 기본 카테고리를 대체(오버라이드)함
 * - _overrides가 없는 커스텀 항목은 목록 끝에 추가됨
 */
function rebuildCategories() {
    ['expense', 'income'].forEach(type => {
        // 1단계: 기본 카테고리를 복사
        const result = DEFAULT_CATEGORIES[type].map(def => {
            // 이 기본 카테고리를 오버라이드하는 커스텀이 있는지 확인
            const override = customCategories[type].find(c => c._overrides === def.name);
            // 오버라이드가 있으면 그걸 사용, 없으면 기본값
            return override ? { name: override.name, icon: override.icon, color: override.color } : { ...def };
        });

        // 2단계: 오버라이드가 아닌 순수 커스텀 카테고리를 뒤에 추가
        const pureCustom = customCategories[type].filter(c => !c._overrides);
        result.push(...pureCustom);

        CATEGORIES[type] = result;
    });
}

// 오버라이드 처리가 포함된 버전으로 재구성
rebuildCategories();

// ============================================================
// 12. 이벤트 리스너 등록
// ============================================================

// --- 폼 제출 이벤트 ---
DOM.form.addEventListener('submit', addTransaction);

// --- 수입/지출 토글 버튼 클릭 이벤트 ---
// 클릭된 버튼에 active 클래스를 부여하고, 카테고리 옵션을 갱신
DOM.toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // 모든 토글 버튼에서 active 제거
        DOM.toggleBtns.forEach(b => b.classList.remove('active'));
        // 클릭된 버튼에 active 추가
        btn.classList.add('active');
        // 현재 타입 업데이트 및 카테고리 목록 갱신
        currentType = btn.dataset.type;
        populateCategories();
    });
});

// --- 뷰 모드 탭 전환 (일별/월별/년도별) ---
// 탭 전환 시 해당 모드에 맞는 필터 UI를 보이고 나머지는 숨김
DOM.viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        DOM.viewTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentView = tab.dataset.view;
        updateFilterVisibility();
        renderTransactions();
    });
});

/**
 * 현재 뷰 모드에 맞는 필터 UI를 보이고 나머지를 숨김
 * - daily: 날짜 선택기 표시
 * - monthly: 월 네비게이터 표시
 * - yearly: 필터 없음 (모두 숨김)
 */
function updateFilterVisibility() {
    DOM.filterDaily.classList.toggle('hidden', currentView !== 'daily');
    DOM.filterMonthly.classList.toggle('hidden', currentView !== 'monthly');
    DOM.filterYearly.classList.toggle('hidden', currentView !== 'yearly');
}

/**
 * 월별 네비게이터의 라벨 텍스트를 업데이트
 * 예: "2026년 3월"
 */
function updateMonthLabel() {
    DOM.monthLabel.textContent = `${selectedYear}년 ${selectedMonth + 1}월`;
}

// --- 일별 필터 이벤트 ---
// 프로그래매틱으로 datePick.value를 바꿀 때 change 이벤트가 중복 발화하는 것을 막는 플래그
let suppressDatePickChange = false;

/**
 * 화살표로 날짜를 이동할 때 사용하는 헬퍼
 * suppressDatePickChange 플래그로 picker의 change 이벤트가 한 번만 처리되도록 보장
 * @param {string} newDate - YYYY-MM-DD 형식의 날짜
 */
function setSelectedDate(newDate) {
    selectedDate = newDate;
    suppressDatePickChange = true;    // change 이벤트 무시 예약
    DOM.datePick.value = newDate;     // picker UI 동기화
    suppressDatePickChange = false;   // 즉시 해제 (동기적으로 실행됨)
    renderTransactions();
}

// 날짜 picker를 직접 변경했을 때 (suppressDatePickChange가 true면 무시)
DOM.datePick.addEventListener('change', () => {
    if (suppressDatePickChange) return;
    selectedDate = DOM.datePick.value;
    renderTransactions();
});

// 날짜 객체를 'YYYY-MM-DD' 로컬 문자열로 변환하는 헬퍼
// (toISOString()은 UTC 기준이라 한국 시간대에서 날짜가 하루 밀릴 수 있음)
function toLocalDateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// 이전 날짜 화살표
DOM.dayPrev.addEventListener('click', () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toLocalDateStr(d));
});

// 다음 날짜 화살표
DOM.dayNext.addEventListener('click', () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(toLocalDateStr(d));
});

// --- 월별 필터 이벤트 ---
// 이전/다음 달 화살표
DOM.monthPrev.addEventListener('click', () => {
    selectedMonth--;
    if (selectedMonth < 0) { selectedMonth = 11; selectedYear--; }
    updateMonthLabel();
    renderTransactions();
});

DOM.monthNext.addEventListener('click', () => {
    selectedMonth++;
    if (selectedMonth > 11) { selectedMonth = 0; selectedYear++; }
    updateMonthLabel();
    renderTransactions();
});

// --- 월 드롭다운 (month-label 클릭 시 표시) ---
DOM.monthLabel.addEventListener('click', () => {
    if (DOM.monthDropdown.classList.contains('open')) {
        closeMonthDropdown();
        return;
    }
    dropdownYear = selectedYear;
    openMonthDropdown();
});

/**
 * 월 선택 드롭다운을 열고, monthLabel 근처에 위치시킴
 */
function openMonthDropdown() {
    renderMonthGrid();
    DOM.dropdownYearLabel.textContent = dropdownYear + '년';

    const rect = DOM.monthLabel.getBoundingClientRect();
    DOM.monthDropdown.style.top = (rect.bottom + 4) + 'px';
    DOM.monthDropdown.style.left = Math.max(8, rect.left) + 'px';
    DOM.monthDropdown.classList.add('open');
}

function closeMonthDropdown() {
    DOM.monthDropdown.classList.remove('open');
}

/**
 * 월 그리드(1~12월)를 렌더링
 * 현재 선택된 월에 active, 실제 이번 달에 current 클래스
 */
function renderMonthGrid() {
    const now = new Date();
    const realYear = now.getFullYear();
    const realMonth = now.getMonth();

    DOM.monthGrid.innerHTML = Array.from({ length: 12 }, (_, i) => {
        let cls = '';
        if (dropdownYear === selectedYear && i === selectedMonth) cls += ' active';
        if (dropdownYear === realYear && i === realMonth) cls += ' current';
        return `<button class="month-grid-btn${cls}" data-month="${i}">${i + 1}월</button>`;
    }).join('');
}

// 드롭다운 년도 이동
DOM.dropdownYearPrev.addEventListener('click', () => {
    dropdownYear--;
    DOM.dropdownYearLabel.textContent = dropdownYear + '년';
    renderMonthGrid();
});

DOM.dropdownYearNext.addEventListener('click', () => {
    dropdownYear++;
    DOM.dropdownYearLabel.textContent = dropdownYear + '년';
    renderMonthGrid();
});

// 월 그리드에서 월 선택
DOM.monthGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.month-grid-btn');
    if (!btn) return;
    selectedYear = dropdownYear;
    selectedMonth = parseInt(btn.dataset.month, 10);
    updateMonthLabel();
    closeMonthDropdown();
    renderTransactions();
});

// 드롭다운 바깥 클릭 시 닫기
document.addEventListener('mousedown', (e) => {
    if (!DOM.monthDropdown.classList.contains('open')) return;
    if (DOM.monthDropdown.contains(e.target)) return;
    if (e.target === DOM.monthLabel) return;
    closeMonthDropdown();
});

// --- 년도별 필터 이벤트 ---
/**
 * 년도별 라벨을 selectedViewYear 기준으로 업데이트
 */
function updateYearLabel() {
    DOM.yearLabel.textContent = selectedViewYear + '년';
}

DOM.yearPrev.addEventListener('click', () => {
    selectedViewYear--;
    updateYearLabel();
    renderTransactions();
});

DOM.yearNext.addEventListener('click', () => {
    selectedViewYear++;
    updateYearLabel();
    renderTransactions();
});

// --- 수입/지출 필터 변경 이벤트 ---
DOM.filterType.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    renderTransactions();
});

// --- 전체 삭제 버튼 ---
DOM.btnClearAll.addEventListener('click', clearAllTransactions);

// --- 카테고리 관리 모달 이벤트 ---
// "관리" 버튼 클릭 시 모달 열기
DOM.btnCategoryManage.addEventListener('click', openCategoryModal);

// 닫기 버튼 또는 오버레이 배경 클릭 시 모달 닫기
DOM.modalClose.addEventListener('click', closeCategoryModal);
DOM.modalOverlay.addEventListener('click', (e) => {
    // 오버레이 자체를 클릭했을 때만 닫기 (모달 내부 클릭은 무시)
    if (e.target === DOM.modalOverlay) closeCategoryModal();
});

// ESC 키로 모달 닫기
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && DOM.modalOverlay.classList.contains('open')) {
        closeCategoryModal();
    }
});

// 수입/지출 탭 전환
DOM.modalTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        DOM.modalTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        modalTab = tab.dataset.tab;
        renderModalCategoryList();
        clearModalInputs();
    });
});

// 차트 색상 버튼 클릭 시 색상 팔레트 열기 (새 카테고리 추가 폼)
DOM.newCatColorBtn.addEventListener('click', () => {
    if (colorPickerEl.classList.contains('open')) {
        closeColorPicker();
        return;
    }
    openColorPicker(DOM.newCatColorBtn, DOM.newCatColor.value, (color) => {
        DOM.newCatColor.value = color;
        DOM.newCatColorDot.style.background = color;
    });
});

// 이모지 선택 버튼 클릭 시 이모지 피커 열기 (새 카테고리 추가 폼)
DOM.newCatIconBtn.addEventListener('click', () => {
    // 피커가 이미 열려있으면 닫기 (토글)
    if (DOM.emojiPicker.classList.contains('open')) {
        closeEmojiPicker();
        return;
    }
    openEmojiPicker(DOM.newCatIconBtn, (emoji) => {
        // 선택한 이모지를 hidden input과 미리보기에 반영
        DOM.newCatIcon.value = emoji;
        DOM.newCatIconPreview.textContent = emoji;
        DOM.newCatIconBtn.classList.add('selected');
    });
});

// "+ 추가" 버튼 클릭 시 새 카테고리 추가
DOM.btnAddCat.addEventListener('click', addCustomCategory);

// 이름 입력 필드에서 Enter 키로도 추가 가능
DOM.newCatName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addCustomCategory();
    }
});

// ============================================================
// 12-1. 데이터 백업 (JSON 내보내기 / 불러오기)
// ============================================================

/**
 * 현재 거래 내역 + 커스텀 카테고리를 JSON 파일로 다운로드
 * - 파일명: "가계부백업_2026-03-26.json" 형식
 */
DOM.btnExportJson.addEventListener('click', () => {
    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions,
        customCategories: JSON.parse(localStorage.getItem(CUSTOM_CAT_KEY) || '{}'),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const dateStr = toLocalDateStr(new Date());
    a.download = `가계부백업_${dateStr}.json`;
    a.click();

    URL.revokeObjectURL(url);
});

/**
 * JSON 백업 파일을 불러와서 데이터 복원
 * - 기존 데이터를 덮어쓰기 전에 사용자에게 확인 요청
 */
DOM.importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const backup = JSON.parse(ev.target.result);

            // 기본 유효성 검사
            if (!Array.isArray(backup.transactions)) {
                alert('올바른 백업 파일이 아닙니다.');
                return;
            }

            const count = backup.transactions.length;
            const confirmed = confirm(
                `백업 파일에 거래 내역 ${count}건이 있습니다.\n` +
                `현재 데이터를 이 파일로 교체하시겠습니까?\n\n` +
                `(기존 데이터는 사라집니다)`
            );
            if (!confirmed) return;

            // 거래 내역 복원
            transactions.length = 0;
            backup.transactions.forEach(tx => transactions.push(tx));
            saveTransactions();

            // 커스텀 카테고리 복원 (있을 경우)
            if (backup.customCategories && typeof backup.customCategories === 'object') {
                localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(backup.customCategories));
                // 카테고리 전역 변수 갱신
                const saved = localStorage.getItem(CUSTOM_CAT_KEY);
                const parsed = saved ? JSON.parse(saved) : {};
                Object.keys(customCategories).forEach(k => delete customCategories[k]);
                Object.assign(customCategories, parsed);
            }

            // 화면 전체 갱신
            rebuildCategories();
            populateCategories();
            updateSummary();
            renderTransactions();
            updateChart();
            updateReport();

            alert(`✅ ${count}건의 데이터를 성공적으로 불러왔습니다.`);
        } catch {
            alert('파일을 읽는 중 오류가 발생했습니다.\nJSON 형식이 올바른지 확인해주세요.');
        } finally {
            // 같은 파일을 다시 선택할 수 있도록 input 초기화
            e.target.value = '';
        }
    };
    reader.readAsText(file);
});

// ============================================================
// 12-2. 지출 보고서 월 네비게이션 + PDF 내보내기
// ============================================================

// 이전 달 보고서
DOM.reportPrev.addEventListener('click', () => {
    reportMonth--;
    if (reportMonth < 0) { reportMonth = 11; reportYear--; }
    updateReport();
});

// 다음 달 보고서
DOM.reportNext.addEventListener('click', () => {
    reportMonth++;
    if (reportMonth > 11) { reportMonth = 0; reportYear++; }
    updateReport();
});

/**
 * 지출 보고서 영역을 PDF로 내보내기
 * html2canvas로 보고서 섹션을 이미지로 캡처한 뒤 jsPDF로 PDF 생성
 */
DOM.btnExportPdf.addEventListener('click', async () => {
    const btn = DOM.btnExportPdf;
    const originalText = btn.innerHTML;

    // 버튼 비활성화 + 로딩 표시
    btn.disabled = true;
    btn.textContent = '생성 중...';

    try {
        const panel = DOM.reportPanel;

        // 내보내기 버튼과 네비게이션 화살표를 잠시 숨김 (PDF에 포함되지 않도록)
        const hideEls = panel.querySelectorAll('.btn-export-pdf, .report-nav .nav-arrow');
        hideEls.forEach(el => el.style.visibility = 'hidden');

        // html2canvas로 보고서 섹션을 이미지로 캡처
        const canvas = await html2canvas(panel, {
            backgroundColor: '#F5F5F7',  // 라이트 배경색
            scale: 2,                     // 고해상도 (2배)
            useCORS: true,
            logging: false,
        });

        // 숨긴 요소 복원
        hideEls.forEach(el => el.style.visibility = '');

        // jsPDF로 PDF 생성 (A4 가로)
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('landscape', 'mm', 'a4');

        // 캔버스 비율에 맞춰 PDF 크기 계산
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const availW = pageWidth - margin * 2;
        const availH = pageHeight - margin * 2;

        const imgRatio = canvas.width / canvas.height;
        let imgW = availW;
        let imgH = imgW / imgRatio;

        // 높이가 페이지를 초과하면 높이 기준으로 축소
        if (imgH > availH) {
            imgH = availH;
            imgW = imgH * imgRatio;
        }

        // 중앙 정렬
        const x = (pageWidth - imgW) / 2;
        const y = (pageHeight - imgH) / 2;

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);

        // 파일명: "2026년 3월 지출 보고서.pdf"
        const fileName = `${reportYear}년 ${reportMonth + 1}월 지출 보고서.pdf`;
        pdf.save(fileName);

    } catch (err) {
        console.error('PDF 생성 실패:', err);
        alert('PDF 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
        // 버튼 복원
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// ============================================================
// 13. 초기화 (앱 시작 시 실행)
// ============================================================

/**
 * 앱 초기화 함수
 * - 날짜 입력 필드를 오늘 날짜로 설정
 * - 카테고리 옵션을 채움
 * - 저장된 데이터를 기반으로 UI를 렌더링
 */
function init() {
    // 날짜 기본값을 오늘로 설정 (YYYY-MM-DD 형식)
    const today = new Date().toISOString().split('T')[0];
    DOM.dateInput.value = today;

    // 일별 필터의 날짜 picker도 오늘로 설정
    selectedDate = today;
    DOM.datePick.value = today;

    // 월별 / 년도별 네비게이터 라벨 초기화
    updateMonthLabel();
    updateYearLabel();

    // 뷰 모드에 맞는 필터 UI 표시
    updateFilterVisibility();

    // 카테고리 옵션 초기 로드
    populateCategories();

    // 저장된 데이터가 있으면 화면에 반영
    updateSummary();
    renderTransactions();
    updateChart();
    updateReport();
}

// 앱 시작!
init();
