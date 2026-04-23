(function() {
  var INGEST = 'https://flix-bd.vercel.app/api/ingest?secret=7ea5f20a7ee15c046fe943ea08113e3a77bb742c';
  var SP_FILE = 'https://einfachbusfahren-my.sharepoint.com/personal/nityanand_baranwal_flix_com/_api/web/GetFileByServerRelativeUrl(\'/personal/nityanand_baranwal_flix_com/Documents/Desktop/Office%20Data/Finance%20India%20Work%20Details/Adesh%20Sharma/Bus%20Partner%20Sheets/BP%20Cost%20Snapshot%20Sheet.xlsm\')/$value';
  var TARGET_SHEET = 'BP Cost Hub';

  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;background:#444444;color:#fff;padding:14px 20px;border-radius:10px;z-index:2147483647;font:500 13px/1.5 -apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);min-width:280px;border-left:4px solid #73D700';
  function setToast(msg, color) { toast.textContent = msg; if(color) toast.style.borderLeftColor = color; }
  setToast('Loading parser...');
  document.body.appendChild(toast);

  fetch('https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js')
    .then(function(r) { return r.text(); })
    .then(function(code) {
      var script = document.createElement('script');
      script.textContent = '(function(){var module={exports:{}};' + code + ';window.__SJS__=module.exports;})();';
      document.head.appendChild(script);

      setToast('Downloading BP Cost Snapshot (3MB)...');
      return fetch(SP_FILE, { credentials: 'include' });
    })
    .then(function(r) {
      if (!r.ok) throw new Error('Download failed (' + r.status + '). Is the SharePoint file open?');
      setToast('Parsing Excel...');
      return r.arrayBuffer();
    })
    .then(function(buf) {
      var SJS = window.__SJS__;
      if (!SJS || !SJS.read) throw new Error('SheetJS failed to load');
      var wb = SJS.read(buf, { type: 'array', cellText: false });

      var sheetName = wb.SheetNames.find(function(n) { return n === TARGET_SHEET; });
      if (!sheetName) throw new Error('Sheet "' + TARGET_SHEET + '" not found. Found: ' + wb.SheetNames.join(', '));
      var ws = wb.Sheets[sheetName];

      var rawArrays = SJS.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

      var weekCount = (function() {
        var seen = {};
        rawArrays.slice(1).forEach(function(r) { if (r[34]) seen[r[34]] = 1; });
        return Object.keys(seen).length;
      })();

      setToast('Sending ' + (rawArrays.length - 1) + ' rows across ' + weekCount + ' weeks...');

      return fetch(INGEST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawArrays: rawArrays, source: 'bookmarklet' })
      });
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.ok) {
        var diag = d.diagnostics || {};
        var dropped = (diag.droppedNoYearWeek || 0) + (diag.droppedNoLineId || 0) + (diag.droppedNoBusKm || 0);
        var msg = 'Synced ' + d.weeks + ' weeks (' + d.totalRows + ' rows)';
        if (dropped > 0) {
          msg += '\nDropped ' + dropped + ': ' +
            (diag.droppedNoLineId || 0) + ' no lineId, ' +
            (diag.droppedNoBusKm || 0) + ' no busKm, ' +
            (diag.droppedNoYearWeek || 0) + ' no yearWeek';
          toast.style.whiteSpace = 'pre-line';
        }
        setToast(msg, dropped > 0 ? '#B45309' : '#73D700');
        // Log the full diagnostics to console so we can inspect row samples
        console.log('[Flix BD ingest]', d);
        setTimeout(function() { toast.remove(); }, 12000);
      } else {
        throw new Error(JSON.stringify(d));
      }
    })
    .catch(function(e) {
      setToast('Error: ' + e.message, '#DC2626');
      setTimeout(function() { toast.remove(); }, 8000);
    });
})();
