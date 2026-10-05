/* @ds-bundle: {"format":4,"namespace":"Hamzist"} */
/* Hamzist design system — runtime helpers for the content rules (08-content.md).
   Classic script, no dependencies: assigns window.Hamzist. Components are CSS-first (bundle.css). */
(function () {
  var FA = "۰۱۲۳۴۵۶۷۸۹";
  var AR = "٠١٢٣٤٥٦٧٨٩";
  function faDigits(value) {
    return String(value).replace(/[0-9]/g, function (d) { return FA[+d]; });
  }
  function latinDigits(value) {
    return String(value)
      .replace(/[۰-۹]/g, function (d) { return String(FA.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String(AR.indexOf(d)); });
  }
  function isUnset(value) {
    return value === null || value === undefined || value === "" || (typeof value === "number" && !isFinite(value));
  }
  var UNSET = "تعیین‌نشده";
  function groupThousands(n) {
    var s = String(Math.round(Math.abs(Number(n))));
    var out = s.replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
    return (Number(n) < 0 ? "-" : "") + faDigits(out);
  }
  /* Money: always Toman, Persian digits, «٬» separator; an unset value is «تعیین‌نشده», never ۰. */
  function toman(value, opts) {
    if (isUnset(value)) return UNSET;
    var withUnit = !(opts && opts.unit === false);
    return groupThousands(value) + (withUnit ? " تومان" : "");
  }
  /* Count / plain number with Persian digits. */
  function number(value) {
    if (isUnset(value)) return "—";
    return groupThousands(value);
  }
  /* Jalali date: «۱۰ مهر ۱۴۰۵» (style "long") or «۱۴۰۵/۰۷/۱۰» (style "short"), Asia/Tehran. */
  function jalali(value, style) {
    if (isUnset(value)) return "—";
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "—";
    var o = style === "short"
      ? { year: "numeric", month: "2-digit", day: "2-digit" }
      : { year: "numeric", month: "long", day: "numeric" };
    o.timeZone = "Asia/Tehran";
    try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-arabext", o).format(d).replace(/‏/g, ""); }
    catch (e) { return faDigits(d.toISOString().slice(0, 10)); }
  }
  /* Search normalisation: Arabic ي/ك → Persian ی/ک, all digits → Latin, ZWNJ → space, lower-case Latin. */
  function normalize(text) {
    return latinDigits(String(text || ""))
      .replace(/ي/g, "ی").replace(/ى/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه")
      .replace(/‌/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }
  /* Mobile: accepts Persian/Arabic digits, returns 09xxxxxxxxx or null. */
  function mobile(value) {
    var v = latinDigits(String(value || "")).replace(/\D/g, "");
    if (v.indexOf("98") === 0 && v.length === 12) v = "0" + v.slice(2);
    return /^09\d{9}$/.test(v) ? v : null;
  }
  /* Iranian national id (10 digits) check-digit validation. */
  function nationalId(value) {
    var v = latinDigits(String(value || "")).replace(/\D/g, "");
    if (!/^\d{10}$/.test(v) || /^(\d)\1{9}$/.test(v)) return false;
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += (+v[i]) * (10 - i);
    var r = sum % 11, c = +v[9];
    return r < 2 ? c === r : c === 11 - r;
  }
  /* Latin identifier isolated for RTL text: returns an HTML string <bdi class="hz-id" dir="ltr">…</bdi>. */
  function idHtml(code) {
    var s = String(code).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; });
    return "<bdi class=\"hz-id\" dir=\"ltr\">" + s + "</bdi>";
  }
  var api = {
    version: "stage-3",
    UNSET: UNSET,
    faDigits: faDigits,
    latinDigits: latinDigits,
    isUnset: isUnset,
    toman: toman,
    number: number,
    jalali: jalali,
    normalize: normalize,
    mobile: mobile,
    nationalId: nationalId,
    idHtml: idHtml
  };
  var w = window;
  w.Hamzist = w.Hamzist || {};
  for (var k in api) if (Object.prototype.hasOwnProperty.call(api, k)) w.Hamzist[k] = api[k];
})();
