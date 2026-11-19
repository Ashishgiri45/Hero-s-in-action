/* restore the viewer's light/dark choice and colour palette before first paint */
(function () { try { var t = localStorage.getItem('se16-theme'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  var p = 'royal'; try { var s = localStorage.getItem('djp.palette'); if (/^(royal|ocean|emerald|sunset)$/.test(s || '')) p = s; } catch (e) {}
  document.documentElement.setAttribute('data-palette', p); })();
