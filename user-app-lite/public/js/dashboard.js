/* dashboard.js – vanilla JS, no build step needed */

(function () {
  'use strict';

  // ── Mini Calendar ──────────────────────────────────────────────────────────
  const calWrap = document.getElementById('mini-calendar');
  if (!calWrap) return;

  // CAL_DATES may be set before this script (EJS) or after (static index.html via window.CAL_DATES)
  let datesWithMeet = new Set((window.CAL_DATES || []).map(d => d.date));

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth(); // 0-based
  let selectedDate = null;

  const MONTHS_TH = [
    'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
  ];
  const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function isoDate(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  function renderCalendar() {
    const today = new Date();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    let html = `
      <div class="cal-nav">
        <button id="cal-prev" aria-label="เดือนก่อน">◀</button>
        <strong>${MONTHS_TH[currentMonth]} ${currentYear + 543}</strong>
        <button id="cal-next" aria-label="เดือนถัดไป">▶</button>
      </div>
      <table role="grid">
        <thead><tr>${DAYS_TH.map(d => `<th>${d}</th>`).join('')}</tr></thead>
        <tbody>`;

    let day = 1;
    for (let row = 0; row < 6; row++) {
      html += '<tr>';
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        if (cellIndex < firstDay || day > daysInMonth) {
          html += '<td></td>';
        } else {
          const iso = isoDate(currentYear, currentMonth, day);
          const classes = [
            today.getFullYear() === currentYear &&
            today.getMonth() === currentMonth &&
            today.getDate() === day ? 'today' : '',
            datesWithMeet.has(iso) ? 'has-meet' : '',
            selectedDate === iso ? 'selected' : ''
          ].filter(Boolean).join(' ');
          html += `<td class="${classes}" data-date="${iso}" tabindex="0" role="gridcell">${day}</td>`;
          day++;
        }
      }
      html += '</tr>';
      if (day > daysInMonth) break;
    }

    html += '</tbody></table>';
    calWrap.innerHTML = html;

    document.getElementById('cal-prev').addEventListener('click', () => {
      currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      renderCalendar();
    });

    calWrap.querySelectorAll('td[data-date]').forEach(td => {
      td.addEventListener('click', () => {
        selectedDate = selectedDate === td.dataset.date ? null : td.dataset.date;
        filterMeets(document.getElementById('meet-search')?.value || '');
        renderCalendar();
      });
    });
  }

  // Expose for index.html to call after async data loads
  window._renderCalendar = function () {
    datesWithMeet = new Set((window.CAL_DATES || []).map(d => d.date));
    renderCalendar();
  };

  renderCalendar();

  // ── Meet list filter ───────────────────────────────────────────────────────
  window.filterMeets = function (text) {
    const q = (text || '').toLowerCase().trim();
    document.querySelectorAll('.meet-card').forEach(card => {
      const matchText = !q ||
        card.dataset.title.includes(q) ||
        card.dataset.desc.includes(q);
      const matchDate = !selectedDate || card.dataset.date === selectedDate;
      card.hidden = !(matchText && matchDate);
    });
  };

})();
