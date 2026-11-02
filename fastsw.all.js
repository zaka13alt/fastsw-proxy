/*!
 * fastsw.all.js — FastSW: service-worker web proxy (libcurl.js + Wisp transport)
 *
 * One file, three roles:
 *   1. Loaded with <script> in a page     -> exposes window.Fastsw (register / encode / go)
 *   2. Registered as a service worker     -> fetches via libcurl.js over Wisp, strips headers,
 *                                            rewrites HTML / JS / CSS, keeps a cookie jar
 *   3. Served to proxied pages as /fastsw/client.js -> the in-page runtime that defines
 *                                            fastsw.location / fastsw.top / fastsw.parent etc.
 *
 * Put this file at the site root (so the SW scope can be "/"), next to index.html.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  CONFIG
   * ------------------------------------------------------------------ */
  const CONFIG = {
    prefix: "/fastsw/service/",          // proxied URLs look like  /fastsw/service/<encodeURIComponent(url)>
    clientPath: "/fastsw/client.js",     // runtime injected into every proxied document
    wisp: "wss://zakaon.top/wisp/",      // your Wisp server (null = same host, /wisp/)
    // Single-file libcurl build (WASM bundled inside) hosted on YOUR origin: put libcurl_full.js in /fastsw/.
    // Acorn (the JS parser) is embedded in this file, so there's nothing else to host.
    libcurlJS: "/fastsw/libcurl.js",
    pageWebSocket: true,                 // inject libcurl into pages so WebSocket() goes through Wisp
  };

  /* ------------------------------------------------------------------ *
   *  Embedded acorn 8 (MIT) — factory form: ACORN_FACTORY(exportsObject)
   * ------------------------------------------------------------------ */
  const ACORN_FACTORY = /* acorn 8 — MIT License, Copyright (C) 2012-2022 by various contributors (see https://github.com/acornjs/acorn/blob/master/acorn/LICENSE) */
  function(t){"use strict";var e=[509,0,227,0,150,4,294,9,1368,2,2,1,6,3,41,2,5,0,166,1,574,3,9,9,7,9,32,4,318,1,31,4,33,15,71,10,50,3,123,2,54,14,32,10,3,1,11,3,46,10,8,0,46,9,7,2,37,13,2,9,6,1,45,0,13,2,49,13,9,3,2,11,83,11,7,0,3,0,158,11,6,9,7,3,56,1,2,6,3,1,3,2,10,0,11,1,3,6,4,4,68,8,2,0,3,0,2,3,2,4,2,0,15,1,83,17,10,9,5,0,82,19,13,9,214,6,3,8,28,1,83,16,16,9,82,12,9,9,7,19,58,14,5,9,243,14,166,9,71,5,2,1,3,3,2,0,2,1,13,9,120,6,3,6,4,0,29,9,41,6,2,3,9,0,10,10,47,15,199,7,137,9,54,7,2,7,17,9,57,21,2,13,123,5,4,0,2,1,2,6,2,0,9,9,49,4,2,1,2,4,9,9,55,9,7,0,259,3,10,1,2,0,49,6,4,4,14,10,5350,0,7,14,11465,27,2343,9,87,9,39,4,60,6,26,9,535,9,470,0,2,54,8,3,82,0,12,1,19628,1,4178,9,519,45,3,22,481,1,61,4,4,5,9,7,3,6,31,3,149,2,12,2,9,1,3,0,33,1,1357,49,513,54,5,49,9,0,15,0,23,4,2,14,1361,6,2,16,3,6,2,1,2,4,101,0,161,6,10,9,357,0,62,13,499,13,245,1,2,9,233,0,3,0,8,1,6,0,475,6,110,6,6,9,4759,9,787719,239],i=[0,11,2,25,2,18,2,1,2,14,3,13,35,122,70,52,268,28,4,48,48,31,14,29,6,37,11,29,3,35,5,7,2,4,43,157,19,35,5,35,5,39,9,51,13,10,2,14,2,6,2,1,2,10,2,14,2,6,2,1,4,51,13,310,10,21,11,7,25,5,2,41,2,13,65,5,3,0,2,43,2,1,4,0,3,22,11,22,10,30,66,18,2,1,11,21,11,25,7,25,39,55,7,1,65,0,16,3,2,2,2,28,43,28,4,28,36,7,2,27,28,53,11,21,11,18,14,17,111,72,56,50,14,50,14,35,39,27,10,22,251,41,7,1,17,5,18,21,18,28,11,0,9,21,43,17,47,20,28,22,13,52,58,1,3,0,14,44,33,24,27,35,30,0,3,0,9,34,4,0,13,47,15,3,22,0,2,0,36,17,2,24,20,1,64,6,2,0,2,3,2,14,2,9,8,46,39,7,3,1,3,21,2,6,2,1,2,4,4,0,19,0,13,4,31,9,2,0,3,0,2,37,2,0,26,0,2,0,45,52,19,3,21,2,31,47,21,1,2,0,185,46,42,3,37,47,21,0,60,42,14,0,72,26,38,6,186,43,117,63,32,7,3,0,3,7,2,1,2,23,16,0,2,0,95,7,3,38,17,0,2,0,29,0,11,39,8,0,22,0,12,45,20,0,19,72,18,0,182,32,32,8,2,36,18,0,50,29,113,6,2,1,2,37,22,0,26,5,2,1,2,31,15,0,24,43,22,0,239,18,16,0,2,12,2,33,125,0,80,921,103,111,6,206,13,310,2314,96,16,1071,18,5,26,3994,6,582,6842,29,1763,568,8,30,18,78,18,29,19,47,17,3,32,20,6,18,433,44,212,63,33,24,3,24,45,74,6,0,67,12,65,1,2,0,15,4,10,7386,37,33,96,114,14,913,15,50,7710,3,2,6,2,1,2,296,10,0,30,2,3,0,15,4,8,395,2309,106,6,12,4,8,8,9,5991,84,2,70,2,1,3,0,3,1,3,3,2,11,2,0,2,6,2,64,2,3,3,7,2,6,2,27,2,3,2,4,2,0,4,6,2,340,2,24,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,7,1845,129,15,6,55,50,49,61,147,44,11,6,17,0,322,29,19,43,485,27,229,29,3,0,208,30,2,2,2,1,2,6,3,4,10,1,225,6,2,3,2,1,2,14,2,196,60,67,8,0,1205,3,2,26,2,1,2,0,3,0,2,9,2,3,2,0,2,0,7,0,5,0,2,0,2,0,2,2,2,1,2,0,3,0,2,0,2,0,2,0,2,0,2,1,2,0,3,3,2,6,2,3,2,3,2,0,2,9,2,16,6,2,2,4,2,16,4421,42719,33,4382,2,5773,3,7472,16,621,2467,541,1507,4938,6,8489,39815,11327],s="ªµºÀ-ÖØ-öø-ˁˆ-ˑˠ-ˤˬˮͰ-ʹͶͷͺ-ͽͿΆΈ-ΊΌΎ-ΡΣ-ϵϷ-ҁҊ-ԯԱ-Ֆ՘ՙՠ-ֈ֋֌א-תׯ-ײؠ-يٮٯٱ-ۓەۥۦۮۯۺ-ۼۿܐܒ-ܯݍ-ޥޱߊ-ߪߴߵߺࠀ-ࠕࠚࠤࠨࡀ-ࡘࡠ-ࡪࡰ-ࢇࢉ-࢏ࢠ-ࣉऄ-हऽॐक़-ॡॱ-ঀঅ-ঌএঐও-নপ-রলশ-হঽৎড়ঢ়য়-ৡৰৱৼਅ-ਊਏਐਓ-ਨਪ-ਰਲਲ਼ਵਸ਼ਸਹਖ਼-ੜਫ਼ੲ-ੴઅ-ઍએ-ઑઓ-નપ-રલળવ-હઽૐૠૡૹଅ-ଌଏଐଓ-ନପ-ରଲଳଵ-ହଽଡ଼ଢ଼ୟ-ୡୱஃஅ-ஊஎ-ஐஒ-கஙசஜஞடணதந-பம-ஹௐఅ-ఌఎ-ఐఒ-నప-హఽౘ-ౚ౜ౝౠౡಀಅ-ಌಎ-ಐಒ-ನಪ-ಳವ-ಹಽ೜-ೞೠೡೱೲഄ-ഌഎ-ഐഒ-ഺഽൎൔ-ൖൟ-ൡൺ-ൿඅ-ඖක-නඳ-රලව-ෆก-ะาำเ-ๆກຂຄຆ-ຊຌ-ຣລວ-ະາຳຽເ-ໄໆໜ-ໟༀཀ-ཇཉ-ཬྈ-ྌက-ဪဿၐ-ၕၚ-ၝၡၥၦၮ-ၰၵ-ႁႎႠ-ჅჇჍა-ჺჼ-ቈቊ-ቍቐ-ቖቘቚ-ቝበ-ኈኊ-ኍነ-ኰኲ-ኵኸ-ኾዀዂ-ዅወ-ዖዘ-ጐጒ-ጕጘ-ፚᎀ-ᎏᎠ-Ᏽᏸ-ᏽᐁ-ᙬᙯ-ᙿᚁ-ᚚᚠ-ᛪᛮ-ᛸᜀ-ᜑᜟ-ᜱᝀ-ᝑᝠ-ᝬᝮ-ᝰក-ឳៗៜᠠ-ᡸᢀ-ᢨᢪᢰ-ᣵᤀ-ᤞᥐ-ᥭᥰ-ᥴᦀ-ᦫᦰ-ᧉᨀ-ᨖᨠ-ᩔᪧᬅ-ᬳᭅ-ᭌᮃ-ᮠᮮᮯᮺ-ᯥᰀ-ᰣᱍ-ᱏᱚ-ᱽᲀ-ᲊᲐ-ᲺᲽ-Ჿᳩ-ᳬᳮ-ᳳᳵᳶᳺᴀ-ᶿḀ-ἕἘ-Ἕἠ-ὅὈ-Ὅὐ-ὗὙὛὝὟ-ώᾀ-ᾴᾶ-ᾼιῂ-ῄῆ-ῌῐ-ΐῖ-Ίῠ-Ῥῲ-ῴῶ-ῼⁱⁿ₏-₟ℂℇℊ-ℓℕ℘-ℝℤΩℨK-ℹℼ-ℿⅅ-ⅉⅎⅠ-ↈⰀ-ⳤⳫ-ⳮⳲⳳⴀ-ⴥⴧⴭⴰ-ⵧⵯⶀ-ⶖⶠ-ⶦⶨ-ⶮⶰ-ⶶⶸ-ⶾⷀ-ⷆⷈ-ⷎⷐ-ⷖⷘ-ⷞ々-〇〡-〩〱-〵〸-〼ぁ-ゖ゛-ゟァ-ヺー-ヿㄅ-ㄯㄱ-ㆎㆠ-ㆿㇰ-ㇿ㐀-䶿一-ꒌꓐ-ꓽꔀ-ꘌꘐ-ꘟꘪꘫꙀ-ꙮꙿ-ꚝꚠ-ꛯꜗ-ꜟꜢ-ꞈꞋ-꟝꟢꟱-ꠁꠃ-ꠅꠇ-ꠊꠌ-ꠢꡀ-ꡳꢂ-ꢳꣲ-ꣷꣻꣽꣾꤊ-ꤥꤰ-ꥆꥠ-ꥼꦄ-ꦲꧏꧠ-ꧤꧦ-ꧯꧺ-ꧾꨀ-ꨨꩀ-ꩂꩄ-ꩋꩠ-ꩶꩺꩾ-ꪯꪱꪵꪶꪹ-ꪽꫀꫂꫛ-ꫝꫠ-ꫪꫲ-ꫴꬁ-ꬆꬉ-ꬎꬑ-ꬖꬠ-ꬦꬨ-ꬮꬰ-ꭚꭜ-ꭩ꭬꭭ꭰ-ꯢ가-힣ힰ-ퟆퟋ-ퟻ豈-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-ﬨשׁ-זּטּ-לּמּנּסּףּפּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-ﷻﹰ-ﹴﹶ-ﻼＡ-Ｚａ-ｚｦ-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ",r={3:"abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",5:"class enum extends super const export import",6:"enum",strict:"implements interface let package private protected public static yield",strictBind:"eval arguments"},a="break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this",n={5:a,"5module":a+" export import",6:a+" const class extends export import super"},o=/^in(stanceof)?$/,h=new RegExp("["+s+"]"),p=new RegExp("["+s+"‌‍·̀-ͯ·҃-֑҇-ׇֽֿׁׂׅׄ-׉ؐ-ًؚ-٩ٰۖ-ۜ۟-۪ۤۧۨ-ۭ۰-۹ܑܰ-݊ަ-ް߀-߉߫-߽߳ࠖ-࠙ࠛ-ࠣࠥ-ࠧࠩ-࡙࠭-࡛ࢗ-࢟࣊-ࣣ࣡-ःऺ-़ा-ॏ॑-ॗॢॣ०-९ঁ-ঃ়া-ৄেৈো-্ৗৢৣ০-৯৾ਁ-ਃ਼ਾ-ੂੇੈੋ-੍ੑ੦-ੱੵઁ-ઃ઼ા-ૅે-ૉો-્ૢૣ૦-૯ૺ-૿ଁ-ଃ଼ା-ୄେୈୋ-୍୓-ୗୢୣ୦-୯ஂா-ூெ-ைொ-்ௗ௦-௯ఀ-ఄ఼ా-ౄె-ైొ-్ౕౖౢౣ౦-౯ಁ-ಃ಼ಾ-ೄೆ-ೈೊ-್ೕೖೢೣ೦-೯ೳഀ-ഃ഻഼ാ-ൄെ-ൈൊ-്ൗൢൣ൦-൯ඁ-ඃ්ා-ුූෘ-ෟ෦-෯ෲෳัิ-ฺ็-๎๐-๙ັິ-ຼ່-໎໐-໙༘༙༠-༩༹༵༷༾༿ཱ-྄྆྇ྍ-ྗྙ-ྼ࿆ါ-ှ၀-၉ၖ-ၙၞ-ၠၢ-ၤၧ-ၭၱ-ၴႂ-ႍႏ-ႝ፝-፟፩-፱ᜒ-᜕ᜲ-᜴ᝒᝓᝲᝳ឴-៓៝០-៩᠋-᠍᠏-᠙ᢩᤠ-ᤫᤰ-᤻᥆-᥏᧐-᧚ᨗ-ᨛᩕ-ᩞ᩠-᩿᩼-᪉᪐-᪙᪰-᪽ᪿ-᫰ᬀ-ᬄ᬴-᭄᭐-᭙᭫-᭳ᮀ-ᮂᮡ-ᮭ᮰-᮹᯦-᯳ᰤ-᰷᱀-᱉᱐-᱙᳐-᳔᳒-᳨᳭᳴᳷-᳹᷀-᷿‌‍‿⁀⁔⃐-⃥⃜⃡-⃰⳯-⵿⳱ⷠ-〪ⷿ-゙゚〯・꘠-꘩꙯ꙴ-꙽ꚞꚟ꛰꛱ꠂ꠆ꠋꠣ-ꠧ꠬ꢀꢁꢴ-ꣅ꣐-꣙꣠-꣱ꣿ-꤉ꤦ-꤭ꥇ-꥓ꦀ-ꦃ꦳-꧀꧐-꧙ꧥ꧰-꧹ꨩ-ꨶꩃꩌꩍ꩐-꩙ꩻ-ꩽꪰꪲ-ꪴꪷꪸꪾ꪿꫁ꫫ-ꫯꫵ꫶ꯣ-ꯪ꯬꯭꯰-꯹ﬞ︀-️︠-︯︳︴﹍-﹏０-９＿･]");function c(t,e){for(var i=65536,s=0;s<e.length;s+=2){if((i+=e[s])>t)return!1;if((i+=e[s+1])>=t)return!0}return!1}function u(t,e){return t<65?36===t:t<91||(t<97?95===t:t<123||(t<=65535?t>=170&&h.test(String.fromCharCode(t)):!1!==e&&c(t,i)))}function l(t,s){return t<48?36===t:t<58||!(t<65)&&(t<91||(t<97?95===t:t<123||(t<=65535?t>=170&&p.test(String.fromCharCode(t)):!1!==s&&(c(t,i)||c(t,e)))))}var d=function(t,e){void 0===e&&(e={}),this.label=t,this.keyword=e.keyword,this.beforeExpr=!!e.beforeExpr,this.startsExpr=!!e.startsExpr,this.isLoop=!!e.isLoop,this.isAssign=!!e.isAssign,this.prefix=!!e.prefix,this.postfix=!!e.postfix,this.binop=e.binop||null,this.updateContext=null};function f(t,e){return new d(t,{beforeExpr:!0,binop:e})}var m={beforeExpr:!0},g={startsExpr:!0},x={};function v(t,e){return void 0===e&&(e={}),e.keyword=t,x[t]=new d(t,e)}var y={num:new d("num",g),regexp:new d("regexp",g),string:new d("string",g),name:new d("name",g),privateId:new d("privateId",g),eof:new d("eof"),bracketL:new d("[",{beforeExpr:!0,startsExpr:!0}),bracketR:new d("]"),braceL:new d("{",{beforeExpr:!0,startsExpr:!0}),braceR:new d("}"),parenL:new d("(",{beforeExpr:!0,startsExpr:!0}),parenR:new d(")"),comma:new d(",",m),semi:new d(";",m),colon:new d(":",m),dot:new d("."),question:new d("?",m),questionDot:new d("?."),arrow:new d("=>",m),template:new d("template"),invalidTemplate:new d("invalidTemplate"),ellipsis:new d("...",m),backQuote:new d("`",g),dollarBraceL:new d("${",{beforeExpr:!0,startsExpr:!0}),eq:new d("=",{beforeExpr:!0,isAssign:!0}),assign:new d("_=",{beforeExpr:!0,isAssign:!0}),incDec:new d("++/--",{prefix:!0,postfix:!0,startsExpr:!0}),prefix:new d("!/~",{beforeExpr:!0,prefix:!0,startsExpr:!0}),logicalOR:f("||",1),logicalAND:f("&&",2),bitwiseOR:f("|",3),bitwiseXOR:f("^",4),bitwiseAND:f("&",5),equality:f("==/!=/===/!==",6),relational:f("</>/<=/>=",7),bitShift:f("<</>>/>>>",8),plusMin:new d("+/-",{beforeExpr:!0,binop:9,prefix:!0,startsExpr:!0}),modulo:f("%",10),star:f("*",10),slash:f("/",10),starstar:new d("**",{beforeExpr:!0}),coalesce:f("??",1),_break:v("break"),_case:v("case",m),_catch:v("catch"),_continue:v("continue"),_debugger:v("debugger"),_default:v("default",m),_do:v("do",{isLoop:!0,beforeExpr:!0}),_else:v("else",m),_finally:v("finally"),_for:v("for",{isLoop:!0}),_function:v("function",g),_if:v("if"),_return:v("return",m),_switch:v("switch"),_throw:v("throw",m),_try:v("try"),_var:v("var"),_const:v("const"),_while:v("while",{isLoop:!0}),_with:v("with"),_new:v("new",{beforeExpr:!0,startsExpr:!0}),_this:v("this",g),_super:v("super",g),_class:v("class",g),_extends:v("extends",m),_export:v("export"),_import:v("import",g),_null:v("null",g),_true:v("true",g),_false:v("false",g),_in:v("in",{beforeExpr:!0,binop:7}),_instanceof:v("instanceof",{beforeExpr:!0,binop:7}),_typeof:v("typeof",{beforeExpr:!0,prefix:!0,startsExpr:!0}),_void:v("void",{beforeExpr:!0,prefix:!0,startsExpr:!0}),_delete:v("delete",{beforeExpr:!0,prefix:!0,startsExpr:!0})},b=/\r\n?|\n|\u2028|\u2029/,k=new RegExp(b.source,"g");function _(t){return 10===t||13===t||8232===t||8233===t}function S(t,e,i){void 0===i&&(i=t.length);for(var s=e;s<i;s++){var r=t.charCodeAt(s);if(_(r))return s<i-1&&13===r&&10===t.charCodeAt(s+1)?s+2:s+1}return-1}var C=/[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/,w=/(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g,E=Object.prototype,A=E.hasOwnProperty,I=E.toString,P=Object.hasOwn||function(t,e){return A.call(t,e)},V=Array.isArray||function(t){return"[object Array]"===I.call(t)},N=Object.create(null);function T(t){return N[t]||(N[t]=new RegExp("^(?:"+t.replace(/ /g,"|")+")$"))}function L(t){return t<=65535?String.fromCharCode(t):(t-=65536,String.fromCharCode(55296+(t>>10),56320+(1023&t)))}var R=/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/,D=function(t,e){this.line=t,this.column=e};D.prototype.offset=function(t){return new D(this.line,this.column+t)};var O=function(t,e,i){this.start=e,this.end=i,null!==t.sourceFile&&(this.source=t.sourceFile)};function B(t,e){for(var i=1,s=0;;){var r=S(t,s,e);if(r<0)return new D(i,e-s);++i,s=r}}var M={ecmaVersion:null,sourceType:"script",strict:!1,onInsertedSemicolon:null,onTrailingComma:null,allowReserved:null,allowReturnOutsideFunction:!1,allowImportExportEverywhere:!1,allowAwaitOutsideFunction:null,allowSuperOutsideMethod:null,allowHashBang:!1,checkPrivateFields:!0,locations:!1,startLocation:null,onToken:null,onComment:null,ranges:!1,program:null,sourceFile:null,directSourceFile:null,preserveParens:!1},F=!1;function U(t){var e={};for(var i in M)e[i]=t&&P(t,i)?t[i]:M[i];if("latest"===e.ecmaVersion?e.ecmaVersion=1e8:null==e.ecmaVersion?(!F&&"object"==typeof console&&console.warn&&(F=!0,console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.")),e.ecmaVersion=11):e.ecmaVersion>=2015&&(e.ecmaVersion-=2009),null==e.allowReserved&&(e.allowReserved=e.ecmaVersion<5),t&&null!=t.allowHashBang||(e.allowHashBang=e.ecmaVersion>=14),V(e.onToken)){var s=e.onToken;e.onToken=function(t){return s.push(t)}}if(V(e.onComment)&&(e.onComment=function(t,e){return function(i,s,r,a,n,o){var h={type:i?"Block":"Line",value:s,start:r,end:a};t.locations&&(h.loc=new O(this,n,o)),t.ranges&&(h.range=[r,a]),e.push(h)}}(e,e.onComment)),"commonjs"===e.sourceType&&e.allowAwaitOutsideFunction)throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs");return e}var q=256,j=259;function G(t,e){return 2|(t?4:0)|(e?8:0)}var H=function(t,e,i){this.options=t=U(t),this.sourceFile=t.sourceFile,this.keywords=T(n[t.ecmaVersion>=6?6:"module"===t.sourceType?"5module":5]);var s="";!0!==t.allowReserved&&(s=r[t.ecmaVersion>=6?6:5===t.ecmaVersion?5:3],"module"===t.sourceType&&(s+=" await")),this.reservedWords=T(s);var a=(s?s+" ":"")+r.strict;this.reservedWordsStrict=T(a),this.reservedWordsStrictBind=T(a+" "+r.strictBind),this.input=String(e),this.containsEsc=!1,this.pos=i||0,this.curLine=1,t.startLocation?(this.lineStart=this.pos-t.startLocation.column,this.curLine=t.startLocation.line):i?(this.lineStart=this.input.lastIndexOf("\n",i-1)+1,this.options.locations&&(this.curLine=this.input.slice(0,this.lineStart).split(b).length)):this.lineStart=0,this.type=y.eof,this.value=null,this.start=this.end=this.pos,this.startLoc=this.endLoc=this.curPosition(),this.lastTokEndLoc=this.lastTokStartLoc=null,this.lastTokStart=this.lastTokEnd=this.pos,this.context=this.initialContext(),this.exprAllowed=!0,this.inModule="module"===t.sourceType,this.strict=this.inModule||!0===t.strict||this.strictDirective(this.pos),this.potentialArrowAt=-1,this.potentialArrowInForAwait=!1,this.yieldPos=this.awaitPos=this.awaitIdentPos=0,this.labels=[],this.undefinedExports=Object.create(null),0===this.pos&&t.allowHashBang&&"#!"===this.input.slice(0,2)&&this.skipLineComment(2),this.scopeStack=[],this.enterScope("commonjs"===this.options.sourceType?2:1),this.regexpState=null,this.privateNameStack=[]},W={inFunction:{configurable:!0},inGenerator:{configurable:!0},inAsync:{configurable:!0},canAwait:{configurable:!0},allowReturn:{configurable:!0},allowSuper:{configurable:!0},allowDirectSuper:{configurable:!0},treatFunctionsAsVar:{configurable:!0},allowNewDotTarget:{configurable:!0},allowUsing:{configurable:!0},inClassStaticBlock:{configurable:!0}};H.prototype.parse=function(){var t=this,e=this.options.program||this.startNode();return this.nextToken(),this.catchStackOverflow(function(){return t.parseTopLevel(e)})},W.inFunction.get=function(){return(2&this.currentVarScope().flags)>0},W.inGenerator.get=function(){return(8&this.currentVarScope().flags)>0},W.inAsync.get=function(){return(4&this.currentVarScope().flags)>0},W.canAwait.get=function(){for(var t=this.scopeStack.length-1;t>=0;t--){var e=this.scopeStack[t].flags;if(768&e)return!1;if(2&e)return(4&e)>0}return this.inModule&&this.options.ecmaVersion>=13||this.options.allowAwaitOutsideFunction},W.allowReturn.get=function(){return!!this.inFunction||!!(this.options.allowReturnOutsideFunction&&1&this.currentVarScope().flags)},W.allowSuper.get=function(){return(64&this.currentThisScope().flags)>0||this.options.allowSuperOutsideMethod},W.allowDirectSuper.get=function(){return(128&this.currentThisScope().flags)>0},W.treatFunctionsAsVar.get=function(){return this.treatFunctionsAsVarInScope(this.currentScope())},W.allowNewDotTarget.get=function(){for(var t=this.scopeStack.length-1;t>=0;t--){var e=this.scopeStack[t].flags;if(768&e||2&e&&!(16&e))return!0}return!1},W.allowUsing.get=function(){var t=this.currentScope().flags;return!(1024&t)&&!(!this.inModule&&1&t)},W.inClassStaticBlock.get=function(){return(this.currentVarScope().flags&q)>0},H.extend=function(){for(var t=[],e=arguments.length;e--;)t[e]=arguments[e];for(var i=this,s=0;s<t.length;s++)i=t[s](i);return i},H.parse=function(t,e){return new this(e,t).parse()},H.parseExpressionAt=function(t,e,i){var s=new this(i,t,e);return s.nextToken(),s.parseExpression()},H.tokenizer=function(t,e){return new this(e,t)},Object.defineProperties(H.prototype,W);var z=H.prototype,K=/^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;function Q(t,e){for(var i=e+1,s=Math.min(t.input.length,e+11);i<s;){var r=t.fullCharCodeAt(i);if(!l(r,!0))break;i+=r<=65535?1:2}return i===e+2&&"in"===t.input.slice(e,i)||i===e+10&&"instanceof"===t.input.slice(e,i)}z.strictDirective=function(t){if(this.options.ecmaVersion<5)return!1;for(;;){w.lastIndex=t,t+=w.exec(this.input)[0].length;var e=K.exec(this.input.slice(t));if(!e)return!1;if("use strict"===(e[1]||e[2])){w.lastIndex=t+e[0].length;var i=w.exec(this.input),s=i.index+i[0].length,r=this.input.charAt(s);return";"===r||"}"===r||b.test(i[0])&&!(/[(`.[+\-/*%<>=,?^&]/.test(r)||"!"===r&&"="===this.input.charAt(s+1)||"i"===r&&Q(this,s))}t+=e[0].length,w.lastIndex=t,t+=w.exec(this.input)[0].length,";"===this.input[t]&&t++}},z.eat=function(t){return this.type===t&&(this.next(),!0)},z.isContextual=function(t){return this.type===y.name&&this.value===t&&!this.containsEsc},z.eatContextual=function(t){return!!this.isContextual(t)&&(this.next(),!0)},z.catchStackOverflow=function(t){try{return t()}catch(t){if(!(t instanceof Error&&(/\bstack\b.*\b(exceeded|overflow)\b/i.test(t.message)||/\btoo much recursion\b/i.test(t.message))))throw t;this.raise(this.start,"Not enough stack space to parse input")}},z.expectContextual=function(t){this.eatContextual(t)||this.unexpected()},z.canInsertSemicolon=function(){return this.type===y.eof||this.type===y.braceR||b.test(this.input.slice(this.lastTokEnd,this.start))},z.insertSemicolon=function(){if(this.canInsertSemicolon())return this.options.onInsertedSemicolon&&this.options.onInsertedSemicolon(this.lastTokEnd,this.lastTokEndLoc),!0},z.semicolon=function(){this.eat(y.semi)||this.insertSemicolon()||this.unexpected()},z.afterTrailingComma=function(t,e){if(this.type===t)return this.options.onTrailingComma&&this.options.onTrailingComma(this.lastTokStart,this.lastTokStartLoc),e||this.next(),!0},z.expect=function(t){this.eat(t)||this.unexpected()},z.unexpected=function(t){this.raise(null!=t?t:this.start,"Unexpected token")};var Y=function(){this.shorthandAssign=this.trailingComma=this.parenthesizedAssign=this.parenthesizedBind=this.doubleProto=-1};z.checkPatternErrors=function(t,e){if(t){t.trailingComma>-1&&this.raiseRecoverable(t.trailingComma,"Comma is not permitted after the rest element");var i=e?t.parenthesizedAssign:t.parenthesizedBind;i>-1&&this.raiseRecoverable(i,e?"Assigning to rvalue":"Parenthesized pattern")}},z.checkExpressionErrors=function(t,e){if(!t)return!1;var i=t.shorthandAssign,s=t.doubleProto;if(!e)return i>=0||s>=0;i>=0&&this.raise(i,"Shorthand property assignments are valid only in destructuring patterns"),s>=0&&this.raiseRecoverable(s,"Redefinition of __proto__ property")},z.checkYieldAwaitInDefaultParams=function(){this.yieldPos&&(!this.awaitPos||this.yieldPos<this.awaitPos)&&this.raise(this.yieldPos,"Yield expression cannot be a default value"),this.awaitPos&&this.raise(this.awaitPos,"Await expression cannot be a default value")},z.isSimpleAssignTarget=function(t){return"ParenthesizedExpression"===t.type?this.isSimpleAssignTarget(t.expression):"Identifier"===t.type||"MemberExpression"===t.type};var X=H.prototype;X.parseTopLevel=function(t){var e=Object.create(null);for(t.body||(t.body=[]);this.type!==y.eof;){var i=this.parseStatement(null,!0,e);t.body.push(i)}if(this.inModule)for(var s=0,r=Object.keys(this.undefinedExports);s<r.length;s+=1){var a=r[s];this.raiseRecoverable(this.undefinedExports[a].start,"Export '"+a+"' is not defined")}return this.adaptDirectivePrologue(t.body),this.next(),t.sourceType="commonjs"===this.options.sourceType?"script":this.options.sourceType,this.finishNode(t,"Program")};var Z={kind:"loop"},$={kind:"switch"};X.isLet=function(t){if(this.options.ecmaVersion<6||!this.isContextual("let"))return!1;w.lastIndex=this.pos;var e=w.exec(this.input),i=this.pos+e[0].length,s=this.fullCharCodeAt(i);if(91===s||92===s)return!0;if(t)return!1;if(123===s)return!0;if(u(s)){var r=i;do{i+=s<=65535?1:2}while(l(s=this.fullCharCodeAt(i)));if(92===s)return!0;var a=this.input.slice(r,i);if(!o.test(a))return!0}return!1},X.isAsyncFunction=function(){if(this.options.ecmaVersion<8||!this.isContextual("async"))return!1;w.lastIndex=this.pos;var t,e=w.exec(this.input),i=this.pos+e[0].length;return!(b.test(this.input.slice(this.pos,i))||"function"!==this.input.slice(i,i+8)||i+8!==this.input.length&&(l(t=this.fullCharCodeAt(i+8))||92===t))},X.isUsingKeyword=function(t,e){if(this.options.ecmaVersion<17||!this.isContextual(t?"await":"using"))return!1;w.lastIndex=this.pos;var i=w.exec(this.input),s=this.pos+i[0].length;if(b.test(this.input.slice(this.pos,s)))return!1;if(t){var r,a=s+5;if("using"!==this.input.slice(s,a)||a===this.input.length||l(r=this.fullCharCodeAt(a))||92===r)return!1;w.lastIndex=a;var n=w.exec(this.input);if(s=a+n[0].length,n&&b.test(this.input.slice(a,s)))return!1}var h=this.fullCharCodeAt(s);if(!u(h)&&92!==h)return!1;var p=s;do{s+=h<=65535?1:2}while(l(h=this.fullCharCodeAt(s)));if(92===h)return!0;var c=this.input.slice(p,s);if(o.test(c))return!1;if(e&&!t&&"of"===c&&(w.lastIndex=s,s+=w.exec(this.input)[0].length,61!==this.input.charCodeAt(s)||61===(h=this.input.charCodeAt(s+1))||62===h))return!1;return!0},X.isAwaitUsing=function(t){return this.isUsingKeyword(!0,t)},X.isUsing=function(t){return this.isUsingKeyword(!1,t)},X.parseStatement=function(t,e,i){var s,r=this.type,a=this.startNode();switch(this.isLet(t)&&(r=y._var,s="let"),r){case y._break:case y._continue:return this.parseBreakContinueStatement(a,r.keyword);case y._debugger:return this.parseDebuggerStatement(a);case y._do:return this.parseDoStatement(a);case y._for:return this.parseForStatement(a);case y._function:return t&&(this.strict||"if"!==t&&"label"!==t)&&this.options.ecmaVersion>=6&&this.unexpected(),this.parseFunctionStatement(a,!1,!t);case y._class:return t&&this.unexpected(),this.parseClass(a,!0);case y._if:return this.parseIfStatement(a);case y._return:return this.parseReturnStatement(a);case y._switch:return this.parseSwitchStatement(a);case y._throw:return this.parseThrowStatement(a);case y._try:return this.parseTryStatement(a);case y._const:case y._var:return s=s||this.value,t&&"var"!==s&&this.unexpected(),this.parseVarStatement(a,s);case y._while:return this.parseWhileStatement(a);case y._with:return this.parseWithStatement(a);case y.braceL:return this.parseBlock(!0,a);case y.semi:return this.parseEmptyStatement(a);case y._export:case y._import:if(this.options.ecmaVersion>10&&r===y._import){w.lastIndex=this.pos;var n=w.exec(this.input),o=this.pos+n[0].length,h=this.input.charCodeAt(o);if(40===h||46===h)return this.parseExpressionStatement(a,this.parseExpression())}return this.options.allowImportExportEverywhere||(e||this.raise(this.start,"'import' and 'export' may only appear at the top level"),this.inModule||this.raise(this.start,"'import' and 'export' may appear only with 'sourceType: module'")),r===y._import?this.parseImport(a):this.parseExport(a,i);default:if(this.isAsyncFunction())return t&&this.unexpected(),this.next(),this.parseFunctionStatement(a,!0,!t);var p=this.isAwaitUsing(!1)?"await using":this.isUsing(!1)?"using":null;if(p)return this.allowUsing||this.raise(this.start,"Using declaration cannot appear in the top level when source type is `script` or in the bare case statement"),t&&this.raise(this.start,"Using declaration is not allowed in single-statement positions"),"await using"===p&&(this.canAwait||this.raise(this.start,"Await using cannot appear outside of async function"),this.next()),this.next(),this.parseVar(a,!1,p),this.semicolon(),this.finishNode(a,"VariableDeclaration");var c=this.value,u=this.parseExpression();return r===y.name&&"Identifier"===u.type&&this.eat(y.colon)?this.parseLabeledStatement(a,c,u,t):this.parseExpressionStatement(a,u)}},X.parseBreakContinueStatement=function(t,e){var i="break"===e;this.next(),this.eat(y.semi)||this.insertSemicolon()?t.label=null:this.type!==y.name?this.unexpected():(t.label=this.parseIdent(),this.semicolon());for(var s=0;s<this.labels.length;++s){var r=this.labels[s];if(null==t.label||r.name===t.label.name){if(null!=r.kind&&(i||"loop"===r.kind))break;if(t.label&&i)break}}return s===this.labels.length&&this.raise(t.start,"Unsyntactic "+e),this.finishNode(t,i?"BreakStatement":"ContinueStatement")},X.parseDebuggerStatement=function(t){return this.next(),this.semicolon(),this.finishNode(t,"DebuggerStatement")},X.parseDoStatement=function(t){return this.next(),this.labels.push(Z),t.body=this.parseStatement("do"),this.labels.pop(),this.expect(y._while),t.test=this.parseParenExpression(),this.options.ecmaVersion>=6?this.eat(y.semi):this.semicolon(),this.finishNode(t,"DoWhileStatement")},X.parseForStatement=function(t){this.next();var e=this.options.ecmaVersion>=9&&this.canAwait&&this.eatContextual("await")?this.lastTokStart:-1;if(this.labels.push(Z),this.enterScope(0),this.expect(y.parenL),this.type===y.semi)return e>-1&&this.unexpected(e),this.parseFor(t,null);var i=this.isLet();if(this.type===y._var||this.type===y._const||i){var s=this.startNode(),r=i?"let":this.value;return this.next(),this.parseVar(s,!0,r),this.finishNode(s,"VariableDeclaration"),this.parseForAfterInit(t,s,e)}var a=this.isContextual("let"),n=!1,o=this.isUsing(!0)?"using":this.isAwaitUsing(!0)?"await using":null;if(o){var h=this.startNode();return this.next(),"await using"===o&&(this.canAwait||this.raise(this.start,"Await using cannot appear outside of async function"),this.next()),this.parseVar(h,!0,o),this.finishNode(h,"VariableDeclaration"),this.parseForAfterInit(t,h,e)}var p=this.containsEsc,c=new Y,u=this.start,l=e>-1?this.parseExprSubscripts(c,"await"):this.parseExpression(!0,c);return this.type===y._in||(n=this.options.ecmaVersion>=6&&this.isContextual("of"))?(e>-1?(this.type===y._in&&this.unexpected(e),t.await=!0):n&&this.options.ecmaVersion>=8&&(l.start!==u||p||"Identifier"!==l.type||"async"!==l.name?this.options.ecmaVersion>=9&&(t.await=!1):this.unexpected()),a&&n&&this.raise(l.start,"The left-hand side of a for-of loop may not start with 'let'."),this.toAssignable(l,!1,c),this.checkLValPattern(l),this.parseForIn(t,l)):(this.checkExpressionErrors(c,!0),e>-1&&this.unexpected(e),this.parseFor(t,l))},X.parseForAfterInit=function(t,e,i){return(this.type===y._in||this.options.ecmaVersion>=6&&this.isContextual("of"))&&1===e.declarations.length?(this.type===y._in?("using"!==e.kind&&"await using"!==e.kind||e.declarations[0].init||this.raise(this.start,"Using declaration is not allowed in for-in loops"),this.options.ecmaVersion>=9&&i>-1&&this.unexpected(i)):this.options.ecmaVersion>=9&&(t.await=i>-1),this.parseForIn(t,e)):(i>-1&&this.unexpected(i),this.parseFor(t,e))},X.parseFunctionStatement=function(t,e,i){return this.next(),this.parseFunction(t,tt|(i?0:et),!1,e)},X.parseIfStatement=function(t){return this.next(),t.test=this.parseParenExpression(),t.consequent=this.parseStatement("if"),t.alternate=this.eat(y._else)?this.parseStatement("if"):null,this.finishNode(t,"IfStatement")},X.parseReturnStatement=function(t){return this.allowReturn||this.raise(this.start,"'return' outside of function"),this.next(),this.eat(y.semi)||this.insertSemicolon()?t.argument=null:(t.argument=this.parseExpression(),this.semicolon()),this.finishNode(t,"ReturnStatement")},X.parseSwitchStatement=function(t){var e;this.next(),t.discriminant=this.parseParenExpression(),t.cases=[],this.expect(y.braceL),this.labels.push($),this.enterScope(1024);for(var i=!1;this.type!==y.braceR;)if(this.type===y._case||this.type===y._default){var s=this.type===y._case;e&&this.finishNode(e,"SwitchCase"),t.cases.push(e=this.startNode()),e.consequent=[],this.next(),s?e.test=this.parseExpression():(i&&this.raiseRecoverable(this.lastTokStart,"Multiple default clauses"),i=!0,e.test=null),this.expect(y.colon)}else e||this.unexpected(),e.consequent.push(this.parseStatement(null));return this.exitScope(),e&&this.finishNode(e,"SwitchCase"),this.next(),this.labels.pop(),this.finishNode(t,"SwitchStatement")},X.parseThrowStatement=function(t){return this.next(),b.test(this.input.slice(this.lastTokEnd,this.start))&&this.raise(this.lastTokEnd,"Illegal newline after throw"),t.argument=this.parseExpression(),this.semicolon(),this.finishNode(t,"ThrowStatement")};var J=[];X.parseCatchClauseParam=function(){var t=this.parseBindingAtom(),e="Identifier"===t.type;return this.enterScope(e?32:0),this.checkLValPattern(t,e?4:2),this.expect(y.parenR),t},X.parseTryStatement=function(t){if(this.next(),t.block=this.parseBlock(),t.handler=null,this.type===y._catch){var e=this.startNode();this.next(),this.eat(y.parenL)?e.param=this.parseCatchClauseParam():(this.options.ecmaVersion<10&&this.unexpected(),e.param=null,this.enterScope(0)),e.body=this.parseBlock(!1),this.exitScope(),t.handler=this.finishNode(e,"CatchClause")}return t.finalizer=this.eat(y._finally)?this.parseBlock():null,t.handler||t.finalizer||this.raise(t.start,"Missing catch or finally clause"),this.finishNode(t,"TryStatement")},X.parseVarStatement=function(t,e,i){return this.next(),this.parseVar(t,!1,e,i),this.semicolon(),this.finishNode(t,"VariableDeclaration")},X.parseWhileStatement=function(t){return this.next(),t.test=this.parseParenExpression(),this.labels.push(Z),t.body=this.parseStatement("while"),this.labels.pop(),this.finishNode(t,"WhileStatement")},X.parseWithStatement=function(t){return this.strict&&this.raise(this.start,"'with' in strict mode"),this.next(),t.object=this.parseParenExpression(),t.body=this.parseStatement("with"),this.finishNode(t,"WithStatement")},X.parseEmptyStatement=function(t){return this.next(),this.finishNode(t,"EmptyStatement")},X.parseLabeledStatement=function(t,e,i,s){for(var r=0,a=this.labels;r<a.length;r+=1){a[r].name===e&&this.raise(i.start,"Label '"+e+"' is already declared")}for(var n=this.type.isLoop?"loop":this.type===y._switch?"switch":null,o=this.labels.length-1;o>=0;o--){var h=this.labels[o];if(h.statementStart!==t.start)break;h.statementStart=this.start,h.kind=n}return this.labels.push({name:e,kind:n,statementStart:this.start}),t.body=this.parseStatement(s?-1===s.indexOf("label")?s+"label":s:"label"),this.labels.pop(),t.label=i,this.finishNode(t,"LabeledStatement")},X.parseExpressionStatement=function(t,e){return t.expression=e,this.semicolon(),this.finishNode(t,"ExpressionStatement")},X.parseBlock=function(t,e,i){for(void 0===t&&(t=!0),void 0===e&&(e=this.startNode()),e.body=[],this.expect(y.braceL),t&&this.enterScope(0);this.type!==y.braceR;){var s=this.parseStatement(null);e.body.push(s)}return i&&(this.strict=!1),this.next(),t&&this.exitScope(),this.finishNode(e,"BlockStatement")},X.parseFor=function(t,e){return t.init=e,this.expect(y.semi),t.test=this.type===y.semi?null:this.parseExpression(),this.expect(y.semi),t.update=this.type===y.parenR?null:this.parseExpression(),this.expect(y.parenR),t.body=this.parseStatement("for"),this.exitScope(),this.labels.pop(),this.finishNode(t,"ForStatement")},X.parseForIn=function(t,e){var i=this.type===y._in;return this.next(),"VariableDeclaration"===e.type&&null!=e.declarations[0].init&&(!i||this.options.ecmaVersion<8||this.strict||"var"!==e.kind||"Identifier"!==e.declarations[0].id.type)&&this.raise(e.start,(i?"for-in":"for-of")+" loop variable declaration may not have an initializer"),t.left=e,t.right=i?this.parseExpression():this.parseMaybeAssign(),this.expect(y.parenR),t.body=this.parseStatement("for"),this.exitScope(),this.labels.pop(),this.finishNode(t,i?"ForInStatement":"ForOfStatement")},X.parseVar=function(t,e,i,s){for(t.declarations=[],t.kind=i;;){var r=this.startNode();if(this.parseVarId(r,i),this.eat(y.eq)?r.init=this.parseMaybeAssign(e):s||"const"!==i||this.type===y._in||this.options.ecmaVersion>=6&&this.isContextual("of")?s||"using"!==i&&"await using"!==i||!(this.options.ecmaVersion>=17)||this.type===y._in||this.isContextual("of")?s||"Identifier"===r.id.type||e&&(this.type===y._in||this.isContextual("of"))?r.init=null:this.raise(this.lastTokEnd,"Complex binding patterns require an initialization value"):this.raise(this.lastTokEnd,"Missing initializer in "+i+" declaration"):this.unexpected(),t.declarations.push(this.finishNode(r,"VariableDeclarator")),!this.eat(y.comma))break}return t},X.parseVarId=function(t,e){t.id="using"===e||"await using"===e?this.parseIdent():this.parseBindingAtom(),this.checkLValPattern(t.id,"var"===e?1:2,!1)};var tt=1,et=2;function it(t,e){var i=e.key.name,s=t[i],r="true";return"MethodDefinition"!==e.type||"get"!==e.kind&&"set"!==e.kind||(r=(e.static?"s":"i")+e.kind),"iget"===s&&"iset"===r||"iset"===s&&"iget"===r||"sget"===s&&"sset"===r||"sset"===s&&"sget"===r?(t[i]="true",!1):!!s||(t[i]=r,!1)}function st(t,e){var i=t.computed,s=t.key;return!i&&("Identifier"===s.type&&s.name===e||"Literal"===s.type&&s.value===e)}X.parseFunction=function(t,e,i,s,r){this.initFunction(t),(this.options.ecmaVersion>=9||this.options.ecmaVersion>=6&&!s)&&(this.type===y.star&&e&et&&this.unexpected(),t.generator=this.eat(y.star)),this.options.ecmaVersion>=8&&(t.async=!!s),e&tt&&(t.id=4&e&&this.type!==y.name?null:this.parseIdent(),!t.id||e&et||this.checkLValSimple(t.id,this.strict||t.generator||t.async?this.treatFunctionsAsVar?1:2:3));var a=this.yieldPos,n=this.awaitPos,o=this.awaitIdentPos;return this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,this.enterScope(G(t.async,t.generator)),e&tt||(t.id=this.type===y.name?this.parseIdent():null),this.parseFunctionParams(t),this.parseFunctionBody(t,i,!1,r),this.yieldPos=a,this.awaitPos=n,this.awaitIdentPos=o,this.finishNode(t,e&tt?"FunctionDeclaration":"FunctionExpression")},X.parseFunctionParams=function(t){this.expect(y.parenL),t.params=this.parseBindingList(y.parenR,!1,this.options.ecmaVersion>=8),this.checkYieldAwaitInDefaultParams()},X.parseClass=function(t,e){this.next();var i=this.strict;this.strict=!0,this.parseClassId(t,e),this.parseClassSuper(t);var s=this.enterClassBody(),r=this.startNode(),a=!1;for(r.body=[],this.expect(y.braceL);this.type!==y.braceR;){var n=this.parseClassElement(null!==t.superClass);n&&(r.body.push(n),"MethodDefinition"===n.type&&"constructor"===n.kind?(a&&this.raiseRecoverable(n.start,"Duplicate constructor in the same class"),a=!0):n.key&&"PrivateIdentifier"===n.key.type&&it(s,n)&&this.raiseRecoverable(n.key.start,"Identifier '#"+n.key.name+"' has already been declared"))}return this.strict=i,this.next(),t.body=this.finishNode(r,"ClassBody"),this.exitClassBody(),this.finishNode(t,e?"ClassDeclaration":"ClassExpression")},X.parseClassElement=function(t){if(this.eat(y.semi))return null;var e=this.options.ecmaVersion,i=this.startNode(),s="",r=!1,a=!1,n="method",o=!1;if(this.eatContextual("static")){if(e>=13&&this.eat(y.braceL))return this.parseClassStaticBlock(i),i;this.isClassElementNameStart()||this.type===y.star?o=!0:s="static"}if(i.static=o,!s&&e>=8&&this.eatContextual("async")&&(!this.isClassElementNameStart()&&this.type!==y.star||this.canInsertSemicolon()?s="async":a=!0),!s&&(e>=9||!a)&&this.eat(y.star)&&(r=!0),!s&&!a&&!r){var h=this.value;(this.eatContextual("get")||this.eatContextual("set"))&&(this.isClassElementNameStart()?n=h:s=h)}if(s?(i.computed=!1,i.key=this.startNodeAt(this.lastTokStart,this.lastTokStartLoc),i.key.name=s,this.finishNode(i.key,"Identifier")):this.parseClassElementName(i),e<13||this.type===y.parenL||"method"!==n||r||a){var p=!i.static&&st(i,"constructor"),c=p&&t;p&&"method"!==n&&this.raise(i.key.start,"Constructor can't have get/set modifier"),i.kind=p?"constructor":n,this.parseClassMethod(i,r,a,c)}else this.parseClassField(i);return i},X.isClassElementNameStart=function(){return this.type===y.name||this.type===y.privateId||this.type===y.num||this.type===y.string||this.type===y.bracketL||this.type.keyword},X.parseClassElementName=function(t){this.type===y.privateId?("constructor"===this.value&&this.raise(this.start,"Classes can't have an element named '#constructor'"),t.computed=!1,t.key=this.parsePrivateIdent()):this.parsePropertyName(t)},X.parseClassMethod=function(t,e,i,s){var r=t.key;"constructor"===t.kind?(e&&this.raise(r.start,"Constructor can't be a generator"),i&&this.raise(r.start,"Constructor can't be an async method")):t.static&&st(t,"prototype")&&this.raise(r.start,"Classes may not have a static property named prototype");var a=t.value=this.parseMethod(e,i,s);return"get"===t.kind&&0!==a.params.length&&this.raiseRecoverable(a.start,"getter should have no params"),"set"===t.kind&&1!==a.params.length&&this.raiseRecoverable(a.start,"setter should have exactly one param"),"set"===t.kind&&"RestElement"===a.params[0].type&&this.raiseRecoverable(a.params[0].start,"Setter cannot use rest params"),this.finishNode(t,"MethodDefinition")},X.parseClassField=function(t){return st(t,"constructor")?this.raise(t.key.start,"Classes can't have a field named 'constructor'"):t.static&&st(t,"prototype")&&this.raise(t.key.start,"Classes can't have a static field named 'prototype'"),this.eat(y.eq)?(this.enterScope(576),t.value=this.parseMaybeAssign(),this.exitScope()):t.value=null,this.semicolon(),this.finishNode(t,"PropertyDefinition")},X.parseClassStaticBlock=function(t){t.body=[];var e=this.labels;for(this.labels=[],this.enterScope(320);this.type!==y.braceR;){var i=this.parseStatement(null);t.body.push(i)}return this.next(),this.exitScope(),this.labels=e,this.finishNode(t,"StaticBlock")},X.parseClassId=function(t,e){this.type===y.name?(t.id=this.parseIdent(),e&&this.checkLValSimple(t.id,2,!1)):(!0===e&&this.unexpected(),t.id=null)},X.parseClassSuper=function(t){t.superClass=this.eat(y._extends)?this.parseExprSubscripts(null,!1):null},X.enterClassBody=function(){var t={declared:Object.create(null),used:[]};return this.privateNameStack.push(t),t.declared},X.exitClassBody=function(){var t=this.privateNameStack.pop(),e=t.declared,i=t.used;if(this.options.checkPrivateFields)for(var s=this.privateNameStack.length,r=0===s?null:this.privateNameStack[s-1],a=0;a<i.length;++a){var n=i[a];P(e,n.name)||(r?r.used.push(n):this.raiseRecoverable(n.start,"Private field '#"+n.name+"' must be declared in an enclosing class"))}},X.parseExportAllDeclaration=function(t,e){return this.options.ecmaVersion>=11&&(this.eatContextual("as")?(t.exported=this.parseModuleExportName(),this.checkExport(e,t.exported,this.lastTokStart)):t.exported=null),this.expectContextual("from"),this.type!==y.string&&this.unexpected(),t.source=this.parseExprAtom(),this.options.ecmaVersion>=16&&(t.attributes=this.parseWithClause()),this.semicolon(),this.finishNode(t,"ExportAllDeclaration")},X.parseExport=function(t,e){if(this.next(),this.eat(y.star))return this.parseExportAllDeclaration(t,e);if(this.eat(y._default))return this.checkExport(e,"default",this.lastTokStart),t.declaration=this.parseExportDefaultDeclaration(),this.finishNode(t,"ExportDefaultDeclaration");if(this.shouldParseExportStatement())t.declaration=this.parseExportDeclaration(t),"VariableDeclaration"===t.declaration.type?this.checkVariableExport(e,t.declaration.declarations):this.checkExport(e,t.declaration.id,t.declaration.id.start),t.specifiers=[],t.source=null,this.options.ecmaVersion>=16&&(t.attributes=[]);else{if(t.declaration=null,t.specifiers=this.parseExportSpecifiers(e),this.eatContextual("from"))this.type!==y.string&&this.unexpected(),t.source=this.parseExprAtom(),this.options.ecmaVersion>=16&&(t.attributes=this.parseWithClause());else{for(var i=0,s=t.specifiers;i<s.length;i+=1){var r=s[i];this.checkUnreserved(r.local),this.checkLocalExport(r.local),"Literal"===r.local.type&&this.raise(r.local.start,"A string literal cannot be used as an exported binding without `from`.")}t.source=null,this.options.ecmaVersion>=16&&(t.attributes=[])}this.semicolon()}return this.finishNode(t,"ExportNamedDeclaration")},X.parseExportDeclaration=function(t){return this.parseStatement(null)},X.parseExportDefaultDeclaration=function(){var t;if(this.type===y._function||(t=this.isAsyncFunction())){var e=this.startNode();return this.next(),t&&this.next(),this.parseFunction(e,4|tt,!1,t)}if(this.type===y._class){var i=this.startNode();return this.parseClass(i,"nullableID")}var s=this.parseMaybeAssign();return this.semicolon(),s},X.checkExport=function(t,e,i){t&&("string"!=typeof e&&(e="Identifier"===e.type?e.name:e.value),P(t,e)&&this.raiseRecoverable(i,"Duplicate export '"+e+"'"),t[e]=!0)},X.checkPatternExport=function(t,e){var i=e.type;if("Identifier"===i)this.checkExport(t,e,e.start);else if("ObjectPattern"===i)for(var s=0,r=e.properties;s<r.length;s+=1){var a=r[s];this.checkPatternExport(t,a)}else if("ArrayPattern"===i)for(var n=0,o=e.elements;n<o.length;n+=1){var h=o[n];h&&this.checkPatternExport(t,h)}else"Property"===i?this.checkPatternExport(t,e.value):"AssignmentPattern"===i?this.checkPatternExport(t,e.left):"RestElement"===i&&this.checkPatternExport(t,e.argument)},X.checkVariableExport=function(t,e){if(t)for(var i=0,s=e;i<s.length;i+=1){var r=s[i];this.checkPatternExport(t,r.id)}},X.shouldParseExportStatement=function(){return"var"===this.type.keyword||"const"===this.type.keyword||"class"===this.type.keyword||"function"===this.type.keyword||this.isLet()||this.isAsyncFunction()},X.parseExportSpecifier=function(t){var e=this.startNode();return e.local=this.parseModuleExportName(),e.exported=this.eatContextual("as")?this.parseModuleExportName():e.local,this.checkExport(t,e.exported,e.exported.start),this.finishNode(e,"ExportSpecifier")},X.parseExportSpecifiers=function(t){var e=[],i=!0;for(this.expect(y.braceL);!this.eat(y.braceR);){if(i)i=!1;else if(this.expect(y.comma),this.afterTrailingComma(y.braceR))break;e.push(this.parseExportSpecifier(t))}return e},X.parseImport=function(t){return this.next(),this.type===y.string?(t.specifiers=J,t.source=this.parseExprAtom()):(t.specifiers=this.parseImportSpecifiers(),this.expectContextual("from"),t.source=this.type===y.string?this.parseExprAtom():this.unexpected()),this.options.ecmaVersion>=16&&(t.attributes=this.parseWithClause()),this.semicolon(),this.finishNode(t,"ImportDeclaration")},X.parseImportSpecifier=function(){var t=this.startNode();return t.imported=this.parseModuleExportName(),this.eatContextual("as")?t.local=this.parseIdent():(this.checkUnreserved(t.imported),t.local=t.imported),this.checkLValSimple(t.local,2),this.finishNode(t,"ImportSpecifier")},X.parseImportDefaultSpecifier=function(){var t=this.startNode();return t.local=this.parseIdent(),this.checkLValSimple(t.local,2),this.finishNode(t,"ImportDefaultSpecifier")},X.parseImportNamespaceSpecifier=function(){var t=this.startNode();return this.next(),this.expectContextual("as"),t.local=this.parseIdent(),this.checkLValSimple(t.local,2),this.finishNode(t,"ImportNamespaceSpecifier")},X.parseImportSpecifiers=function(){var t=[],e=!0;if(this.type===y.name&&(t.push(this.parseImportDefaultSpecifier()),!this.eat(y.comma)))return t;if(this.type===y.star)return t.push(this.parseImportNamespaceSpecifier()),t;for(this.expect(y.braceL);!this.eat(y.braceR);){if(e)e=!1;else if(this.expect(y.comma),this.afterTrailingComma(y.braceR))break;t.push(this.parseImportSpecifier())}return t},X.parseWithClause=function(){var t=[];if(!this.eat(y._with))return t;this.expect(y.braceL);for(var e={},i=!0;!this.eat(y.braceR);){if(i)i=!1;else if(this.expect(y.comma),this.afterTrailingComma(y.braceR))break;var s=this.parseImportAttribute(),r="Identifier"===s.key.type?s.key.name:s.key.value;P(e,r)&&this.raiseRecoverable(s.key.start,"Duplicate attribute key '"+r+"'"),e[r]=!0,t.push(s)}return t},X.parseImportAttribute=function(){var t=this.startNode();return t.key=this.type===y.string?this.parseExprAtom():this.parseIdent("never"!==this.options.allowReserved),this.expect(y.colon),this.type!==y.string&&this.unexpected(),t.value=this.parseExprAtom(),this.finishNode(t,"ImportAttribute")},X.parseModuleExportName=function(){if(this.options.ecmaVersion>=13&&this.type===y.string){var t=this.parseLiteral(this.value);return R.test(t.value)&&this.raise(t.start,"An export name cannot include a lone surrogate."),t}return this.parseIdent(!0)},X.adaptDirectivePrologue=function(t){for(var e=0;e<t.length&&this.isDirectiveCandidate(t[e]);++e)t[e].directive=t[e].expression.raw.slice(1,-1)},X.isDirectiveCandidate=function(t){return this.options.ecmaVersion>=5&&"ExpressionStatement"===t.type&&"Literal"===t.expression.type&&"string"==typeof t.expression.value&&('"'===this.input[t.start]||"'"===this.input[t.start])};var rt=H.prototype;rt.toAssignable=function(t,e,i){if(this.options.ecmaVersion>=6&&t)switch(t.type){case"Identifier":this.inAsync&&"await"===t.name&&this.raise(t.start,"Cannot use 'await' as identifier inside an async function");break;case"ObjectPattern":case"ArrayPattern":case"AssignmentPattern":case"RestElement":break;case"ObjectExpression":t.type="ObjectPattern",i&&this.checkPatternErrors(i,!0);for(var s=0,r=t.properties;s<r.length;s+=1){var a=r[s];this.toAssignable(a,e),"RestElement"!==a.type||"ArrayPattern"!==a.argument.type&&"ObjectPattern"!==a.argument.type||this.raise(a.argument.start,"Unexpected token")}break;case"Property":"init"!==t.kind&&this.raise(t.key.start,"Object pattern can't contain getter or setter"),this.toAssignable(t.value,e);break;case"ArrayExpression":t.type="ArrayPattern",i&&this.checkPatternErrors(i,!0),this.toAssignableList(t.elements,e);break;case"SpreadElement":t.type="RestElement",this.toAssignable(t.argument,e),"AssignmentPattern"===t.argument.type&&this.raise(t.argument.start,"Rest elements cannot have a default value");break;case"AssignmentExpression":"="!==t.operator&&this.raise(t.left.end,"Only '=' operator can be used for specifying default value."),t.type="AssignmentPattern",delete t.operator,this.toAssignable(t.left,e);break;case"ParenthesizedExpression":this.toAssignable(t.expression,e,i);break;case"ChainExpression":this.raiseRecoverable(t.start,"Optional chaining cannot appear in left-hand side");break;case"MemberExpression":if(!e)break;default:this.raise(t.start,"Assigning to rvalue")}else i&&this.checkPatternErrors(i,!0);return t},rt.toAssignableList=function(t,e){for(var i=t.length,s=0;s<i;s++){var r=t[s];r&&this.toAssignable(r,e)}if(i){var a=t[i-1];6===this.options.ecmaVersion&&e&&a&&"RestElement"===a.type&&"Identifier"!==a.argument.type&&this.unexpected(a.argument.start)}return t},rt.parseSpread=function(t){var e=this.startNode();return this.next(),e.argument=this.parseMaybeAssign(!1,t),this.finishNode(e,"SpreadElement")},rt.parseRestBinding=function(){var t=this.startNode();return this.next(),6===this.options.ecmaVersion&&this.type!==y.name&&this.unexpected(),t.argument=this.parseBindingAtom(),this.finishNode(t,"RestElement")},rt.parseBindingAtom=function(){if(this.options.ecmaVersion>=6)switch(this.type){case y.bracketL:var t=this.startNode();return this.next(),t.elements=this.parseBindingList(y.bracketR,!0,!0),this.finishNode(t,"ArrayPattern");case y.braceL:return this.parseObj(!0)}return this.parseIdent()},rt.parseBindingList=function(t,e,i,s){for(var r=[],a=!0;!this.eat(t);)if(a?a=!1:this.expect(y.comma),e&&this.type===y.comma)r.push(null);else{if(i&&this.afterTrailingComma(t))break;if(this.type===y.ellipsis){var n=this.parseRestBinding();this.parseBindingListItem(n),r.push(n),this.type===y.comma&&this.raiseRecoverable(this.start,"Comma is not permitted after the rest element"),this.expect(t);break}r.push(this.parseAssignableListItem(s))}return r},rt.parseAssignableListItem=function(t){var e=this.parseMaybeDefault(this.start,this.startLoc);return this.parseBindingListItem(e),e},rt.parseBindingListItem=function(t){return t},rt.parseMaybeDefault=function(t,e,i){if(i=i||this.parseBindingAtom(),this.options.ecmaVersion<6||!this.eat(y.eq))return i;var s=this.startNodeAt(t,e);return s.left=i,s.right=this.parseMaybeAssign(),this.finishNode(s,"AssignmentPattern")},rt.checkLValSimple=function(t,e,i){void 0===e&&(e=0);var s=0!==e;switch(t.type){case"Identifier":this.strict&&this.reservedWordsStrictBind.test(t.name)&&this.raiseRecoverable(t.start,(s?"Binding ":"Assigning to ")+t.name+" in strict mode"),s&&(2===e&&"let"===t.name&&this.raiseRecoverable(t.start,"let is disallowed as a lexically bound name"),i&&(P(i,t.name)&&this.raiseRecoverable(t.start,"Argument name clash"),i[t.name]=!0),5!==e&&this.declareName(t.name,e,t.start));break;case"ChainExpression":this.raiseRecoverable(t.start,"Optional chaining cannot appear in left-hand side");break;case"MemberExpression":s&&this.raiseRecoverable(t.start,"Binding member expression");break;case"ParenthesizedExpression":return s&&this.raiseRecoverable(t.start,"Binding parenthesized expression"),this.checkLValSimple(t.expression,e,i);default:this.raise(t.start,(s?"Binding":"Assigning to")+" rvalue")}},rt.checkLValPattern=function(t,e,i){switch(void 0===e&&(e=0),t.type){case"ObjectPattern":for(var s=0,r=t.properties;s<r.length;s+=1){var a=r[s];this.checkLValInnerPattern(a,e,i)}break;case"ArrayPattern":for(var n=0,o=t.elements;n<o.length;n+=1){var h=o[n];h&&this.checkLValInnerPattern(h,e,i)}break;default:this.checkLValSimple(t,e,i)}},rt.checkLValInnerPattern=function(t,e,i){switch(void 0===e&&(e=0),t.type){case"Property":this.checkLValInnerPattern(t.value,e,i);break;case"AssignmentPattern":this.checkLValPattern(t.left,e,i);break;case"RestElement":this.checkLValPattern(t.argument,e,i);break;default:this.checkLValPattern(t,e,i)}};var at=function(t,e,i,s,r){this.token=t,this.isExpr=!!e,this.preserveSpace=!!i,this.override=s,this.generator=!!r},nt={b_stat:new at("{",!1),b_expr:new at("{",!0),b_tmpl:new at("${",!1),p_stat:new at("(",!1),p_expr:new at("(",!0),q_tmpl:new at("`",!0,!0,function(t){return t.tryReadTemplateToken()}),f_stat:new at("function",!1),f_expr:new at("function",!0),f_expr_gen:new at("function",!0,!1,null,!0),f_gen:new at("function",!1,!1,null,!0)},ot=H.prototype;ot.initialContext=function(){return[nt.b_stat]},ot.curContext=function(){return this.context[this.context.length-1]},ot.braceIsBlock=function(t){var e=this.curContext();return e===nt.f_expr||e===nt.f_stat||(t!==y.colon||e!==nt.b_stat&&e!==nt.b_expr?t===y._return||t===y.name&&this.exprAllowed?b.test(this.input.slice(this.lastTokEnd,this.start)):t===y._else||t===y.semi||t===y.eof||t===y.parenR||t===y.arrow||(t===y.braceL?e===nt.b_stat:t!==y._var&&t!==y._const&&t!==y.name&&!this.exprAllowed):!e.isExpr)},ot.inGeneratorContext=function(){for(var t=this.context.length-1;t>=1;t--){var e=this.context[t];if("function"===e.token)return e.generator}return!1},ot.updateContext=function(t){var e,i=this.type;i.keyword&&t===y.dot?this.exprAllowed=!1:(e=i.updateContext)?e.call(this,t):this.exprAllowed=i.beforeExpr},ot.overrideContext=function(t){this.curContext()!==t&&(this.context[this.context.length-1]=t)},y.parenR.updateContext=y.braceR.updateContext=function(){if(1!==this.context.length){var t=this.context.pop();t===nt.b_stat&&"function"===this.curContext().token&&(t=this.context.pop()),this.exprAllowed=!t.isExpr}else this.exprAllowed=!0},y.braceL.updateContext=function(t){this.context.push(this.braceIsBlock(t)?nt.b_stat:nt.b_expr),this.exprAllowed=!0},y.dollarBraceL.updateContext=function(){this.context.push(nt.b_tmpl),this.exprAllowed=!0},y.parenL.updateContext=function(t){var e=t===y._if||t===y._for||t===y._with||t===y._while;this.context.push(e?nt.p_stat:nt.p_expr),this.exprAllowed=!0},y.incDec.updateContext=function(){},y._function.updateContext=y._class.updateContext=function(t){!t.beforeExpr||t===y._else||t===y.semi&&this.curContext()!==nt.p_stat||t===y._return&&b.test(this.input.slice(this.lastTokEnd,this.start))||(t===y.colon||t===y.braceL)&&this.curContext()===nt.b_stat?this.context.push(nt.f_stat):this.context.push(nt.f_expr),this.exprAllowed=!1},y.colon.updateContext=function(){"function"===this.curContext().token&&this.context.pop(),this.exprAllowed=!0},y.backQuote.updateContext=function(){this.curContext()===nt.q_tmpl?this.context.pop():this.context.push(nt.q_tmpl),this.exprAllowed=!1},y.star.updateContext=function(t){if(t===y._function){var e=this.context.length-1;this.context[e]===nt.f_expr?this.context[e]=nt.f_expr_gen:this.context[e]=nt.f_gen}this.exprAllowed=!0},y.name.updateContext=function(t){var e=!1;this.options.ecmaVersion>=6&&t!==y.dot&&("of"===this.value&&!this.exprAllowed||"yield"===this.value&&this.inGeneratorContext())&&(e=!0),this.exprAllowed=e};var ht=H.prototype;function pt(t){return"Identifier"===t.type||"ParenthesizedExpression"===t.type&&pt(t.expression)}function ct(t){return"MemberExpression"===t.type&&"PrivateIdentifier"===t.property.type||"ChainExpression"===t.type&&ct(t.expression)||"ParenthesizedExpression"===t.type&&ct(t.expression)}ht.checkPropClash=function(t,e,i){if(!(this.options.ecmaVersion>=9&&"SpreadElement"===t.type||this.options.ecmaVersion>=6&&(t.computed||t.method||t.shorthand))){var s,r=t.key;switch(r.type){case"Identifier":s=r.name;break;case"Literal":s=String(r.value);break;default:return}var a=t.kind;if(this.options.ecmaVersion>=6)"__proto__"===s&&"init"===a&&(e.proto&&(i?i.doubleProto<0&&(i.doubleProto=r.start):this.raiseRecoverable(r.start,"Redefinition of __proto__ property")),e.proto=!0);else{var n=e[s="$"+s];if(n)("init"===a?this.strict&&n.init||n.get||n.set:n.init||n[a])&&this.raiseRecoverable(r.start,"Redefinition of property");else n=e[s]={init:!1,get:!1,set:!1};n[a]=!0}}},ht.parseExpression=function(t,e){var i=this;return this.catchStackOverflow(function(){var s=i.start,r=i.startLoc,a=i.parseMaybeAssign(t,e);if(i.type===y.comma){var n=i.startNodeAt(s,r);for(n.expressions=[a];i.eat(y.comma);)n.expressions.push(i.parseMaybeAssign(t,e));return i.finishNode(n,"SequenceExpression")}return a})},ht.parseMaybeAssign=function(t,e,i){if(this.isContextual("yield")){if(this.inGenerator)return this.parseYield(t);this.exprAllowed=!1}var s=!1,r=-1,a=-1,n=-1;e?(r=e.parenthesizedAssign,a=e.trailingComma,n=e.doubleProto,e.parenthesizedAssign=e.trailingComma=-1):(e=new Y,s=!0);var o=this.start,h=this.startLoc;this.type!==y.parenL&&this.type!==y.name||(this.potentialArrowAt=this.start,this.potentialArrowInForAwait="await"===t);var p=this.parseMaybeConditional(t,e);if(i&&(p=i.call(this,p,o,h)),this.type.isAssign){var c=this.startNodeAt(o,h);return c.operator=this.value,this.type===y.eq&&(p=this.toAssignable(p,!1,e)),s||(e.parenthesizedAssign=e.trailingComma=-1,e.shorthandAssign>=p.start&&(e.shorthandAssign=-1),e.doubleProto>=p.start&&(e.doubleProto=-1)),this.type===y.eq?this.checkLValPattern(p):this.checkLValSimple(p),c.left=p,this.next(),c.right=this.parseMaybeAssign(t),n>-1&&(e.doubleProto=n),this.finishNode(c,"AssignmentExpression")}return s&&this.checkExpressionErrors(e,!0),r>-1&&(e.parenthesizedAssign=r),a>-1&&(e.trailingComma=a),p},ht.parseMaybeConditional=function(t,e){var i=this.start,s=this.startLoc,r=this.parseExprOps(t,e);if(this.checkExpressionErrors(e))return r;if(("ArrowFunctionExpression"!==r.type||r.start!==i)&&this.eat(y.question)){var a=this.startNodeAt(i,s);return a.test=r,a.consequent=this.parseMaybeAssign(),this.expect(y.colon),a.alternate=this.parseMaybeAssign(t),this.finishNode(a,"ConditionalExpression")}return r},ht.parseExprOps=function(t,e){var i=this.start,s=this.startLoc,r=this.parseMaybeUnary(e,!1,!1,t);return this.checkExpressionErrors(e)||r.start===i&&"ArrowFunctionExpression"===r.type?r:this.parseExprOp(r,i,s,-1,t)},ht.parseExprOp=function(t,e,i,s,r){var a=this.type.binop;if(null!=a&&(!r||this.type!==y._in)&&a>s){var n=this.type===y.logicalOR||this.type===y.logicalAND,o=this.type===y.coalesce;o&&(a=y.logicalAND.binop);var h=this.value;this.next();var p=this.start,c=this.startLoc,u=this.parseExprOp(this.parseMaybeUnary(null,!1,!1,r),p,c,a,r),l=this.buildBinary(e,i,t,u,h,n||o);return(n&&this.type===y.coalesce||o&&(this.type===y.logicalOR||this.type===y.logicalAND))&&this.raiseRecoverable(this.start,"Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses"),this.parseExprOp(l,e,i,s,r)}return t},ht.buildBinary=function(t,e,i,s,r,a){"PrivateIdentifier"===s.type&&this.raise(s.start,"Private identifier can only be left side of binary expression");var n=this.startNodeAt(t,e);return n.left=i,n.operator=r,n.right=s,this.finishNode(n,a?"LogicalExpression":"BinaryExpression")},ht.parseMaybeUnary=function(t,e,i,s){var r,a=this.start,n=this.startLoc;if(this.isContextual("await")&&this.canAwait)r=this.parseAwait(s),e=!0;else if(this.type.prefix){var o=this.startNode(),h=this.type===y.incDec;o.operator=this.value,o.prefix=!0,this.next(),o.argument=this.parseMaybeUnary(null,!0,h,s),this.checkExpressionErrors(t,!0),h?this.checkLValSimple(o.argument):this.strict&&"delete"===o.operator&&pt(o.argument)?this.raiseRecoverable(o.start,"Deleting local variable in strict mode"):"delete"===o.operator&&ct(o.argument)?this.raiseRecoverable(o.start,"Private fields can not be deleted"):e=!0,r=this.finishNode(o,h?"UpdateExpression":"UnaryExpression")}else if(e||this.type!==y.privateId){if(r=this.parseExprSubscripts(t,s),this.checkExpressionErrors(t))return r;for(;this.type.postfix&&!this.canInsertSemicolon();){var p=this.startNodeAt(a,n);p.operator=this.value,p.prefix=!1,p.argument=r,this.checkLValSimple(r),this.next(),r=this.finishNode(p,"UpdateExpression")}}else(s||0===this.privateNameStack.length)&&this.options.checkPrivateFields&&this.unexpected(),r=this.parsePrivateIdent(),this.type!==y._in&&this.unexpected();return i||"ArrowFunctionExpression"===r.type&&r.start===a||!this.eat(y.starstar)?r:e?void this.unexpected(this.lastTokStart):this.buildBinary(a,n,r,this.parseMaybeUnary(null,!1,!1,s),"**",!1)},ht.parseExprSubscripts=function(t,e){var i=this.start,s=this.startLoc,r=-1,a=-1;t&&(r=t.doubleProto,a=t.shorthandAssign,t.doubleProto=t.shorthandAssign=-1);var n=this.parseExprAtom(t,e);if("ArrowFunctionExpression"===n.type&&")"!==this.input.slice(this.lastTokStart,this.lastTokEnd))return n;var o=this.parseSubscripts(n,i,s,!1,e);return t&&(o.end>n.end&&(this.checkExpressionErrors(t,!0),t.parenthesizedAssign>=o.start&&(t.parenthesizedAssign=-1),t.parenthesizedBind>=o.start&&(t.parenthesizedBind=-1),t.trailingComma>=o.start&&(t.trailingComma=-1)),r>-1&&(t.doubleProto=r),a>-1&&(t.shorthandAssign=a)),o},ht.parseSubscripts=function(t,e,i,s,r){for(var a=this.options.ecmaVersion>=8&&"Identifier"===t.type&&"async"===t.name&&this.lastTokEnd===t.end&&!this.canInsertSemicolon()&&t.end-t.start===5&&this.potentialArrowAt===t.start,n=!1;;){var o=this.parseSubscript(t,e,i,s,a,n,r);if(o.optional&&(n=!0),o.end===t.end||"ArrowFunctionExpression"===o.type){if(n){var h=this.startNodeAt(e,i);h.expression=o,o=this.finishNode(h,"ChainExpression")}return o}t=o,a=!1}},ht.shouldParseAsyncArrow=function(){return!this.canInsertSemicolon()&&this.eat(y.arrow)},ht.parseSubscriptAsyncArrow=function(t,e,i,s){return this.parseArrowExpression(this.startNodeAt(t,e),i,!0,s)},ht.parseSubscript=function(t,e,i,s,r,a,n){var o=this.options.ecmaVersion>=11,h=o&&this.eat(y.questionDot);s&&h&&this.raise(this.lastTokStart,"Optional chaining cannot appear in the callee of new expressions");var p=this.eat(y.bracketL);if(p||h&&this.type!==y.parenL&&this.type!==y.backQuote||this.eat(y.dot)){var c=this.startNodeAt(e,i);c.object=t,p?(c.property=this.parseExpression(),this.expect(y.bracketR)):this.type===y.privateId&&"Super"!==t.type?c.property=this.parsePrivateIdent():c.property=this.parseIdent("never"!==this.options.allowReserved),c.computed=!!p,o&&(c.optional=h),t=this.finishNode(c,"MemberExpression")}else if(!s&&this.eat(y.parenL)){var u=new Y,l=this.yieldPos,d=this.awaitPos,f=this.awaitIdentPos;this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0;var m=this.parseExprList(y.parenR,this.options.ecmaVersion>=8,!1,u);if(r&&!h&&this.shouldParseAsyncArrow())return this.checkPatternErrors(u,!1),this.checkYieldAwaitInDefaultParams(),this.awaitIdentPos>0&&this.raise(this.awaitIdentPos,"Cannot use 'await' as identifier inside an async function"),this.yieldPos=l,this.awaitPos=d,this.awaitIdentPos=f,this.parseSubscriptAsyncArrow(e,i,m,n);this.checkExpressionErrors(u,!0),this.yieldPos=l||this.yieldPos,this.awaitPos=d||this.awaitPos,this.awaitIdentPos=f||this.awaitIdentPos;var g=this.startNodeAt(e,i);g.callee=t,g.arguments=m,o&&(g.optional=h),t=this.finishNode(g,"CallExpression")}else if(this.type===y.backQuote){(h||a)&&this.raise(this.start,"Optional chaining cannot appear in the tag of tagged template expressions");var x=this.startNodeAt(e,i);x.tag=t,x.quasi=this.parseTemplate({isTagged:!0}),t=this.finishNode(x,"TaggedTemplateExpression")}return t},ht.parseExprAtom=function(t,e,i){this.type===y.slash&&this.readRegexp();var s,r=this.potentialArrowAt===this.start;switch(this.type){case y._super:return this.allowSuper||this.raise(this.start,"'super' keyword outside a method"),s=this.startNode(),this.next(),this.type!==y.parenL||this.allowDirectSuper||this.raise(s.start,"super() call outside constructor of a subclass"),this.type!==y.dot&&this.type!==y.bracketL&&this.type!==y.parenL&&this.unexpected(),this.finishNode(s,"Super");case y._this:return s=this.startNode(),this.next(),this.finishNode(s,"ThisExpression");case y.name:var a=this.start,n=this.startLoc,o=this.containsEsc,h=this.parseIdent(!1);if(this.options.ecmaVersion>=8&&!o&&"async"===h.name&&!this.canInsertSemicolon()&&this.eat(y._function))return this.overrideContext(nt.f_expr),this.parseFunction(this.startNodeAt(a,n),0,!1,!0,e);if(r&&!this.canInsertSemicolon()){if(this.eat(y.arrow))return this.parseArrowExpression(this.startNodeAt(a,n),[h],!1,e);if(this.options.ecmaVersion>=8&&"async"===h.name&&this.type===y.name&&!o&&(!this.potentialArrowInForAwait||"of"!==this.value||this.containsEsc))return h=this.parseIdent(!1),!this.canInsertSemicolon()&&this.eat(y.arrow)||this.unexpected(),this.parseArrowExpression(this.startNodeAt(a,n),[h],!0,e)}return h;case y.regexp:var p=this.value;return(s=this.parseLiteral(p.value)).regex={pattern:p.pattern,flags:p.flags},s;case y.num:case y.string:return this.parseLiteral(this.value);case y._null:case y._true:case y._false:return(s=this.startNode()).value=this.type===y._null?null:this.type===y._true,s.raw=this.type.keyword,this.next(),this.finishNode(s,"Literal");case y.parenL:var c=this.start,u=this.parseParenAndDistinguishExpression(r,e);return t&&(t.parenthesizedAssign<0&&!this.isSimpleAssignTarget(u)&&(t.parenthesizedAssign=c),t.parenthesizedBind<0&&(t.parenthesizedBind=c)),u;case y.bracketL:return s=this.startNode(),this.next(),s.elements=this.parseExprList(y.bracketR,!0,!0,t),this.finishNode(s,"ArrayExpression");case y.braceL:return this.overrideContext(nt.b_expr),this.parseObj(!1,t);case y._function:return s=this.startNode(),this.next(),this.parseFunction(s,0);case y._class:return this.parseClass(this.startNode(),!1);case y._new:return this.parseNew();case y.backQuote:return this.parseTemplate();case y._import:return this.options.ecmaVersion>=11?this.parseExprImport(i):this.unexpected();default:return this.parseExprAtomDefault()}},ht.parseExprAtomDefault=function(){this.unexpected()},ht.parseExprImport=function(t){var e=this.startNode();if(this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword import"),this.next(),this.type===y.parenL&&!t)return this.parseDynamicImport(e);if(this.type===y.dot){var i=this.startNodeAt(e.start,e.loc&&e.loc.start);return i.name="import",e.meta=this.finishNode(i,"Identifier"),this.parseImportMeta(e)}this.unexpected()},ht.parseDynamicImport=function(t){if(this.next(),t.source=this.parseMaybeAssign(),this.options.ecmaVersion>=16)this.eat(y.parenR)?t.options=null:(this.expect(y.comma),this.afterTrailingComma(y.parenR)?t.options=null:(t.options=this.parseMaybeAssign(),this.eat(y.parenR)||(this.expect(y.comma),this.afterTrailingComma(y.parenR)||this.unexpected())));else if(!this.eat(y.parenR)){var e=this.start;this.eat(y.comma)&&this.eat(y.parenR)?this.raiseRecoverable(e,"Trailing comma is not allowed in import()"):this.unexpected(e)}return this.finishNode(t,"ImportExpression")},ht.parseImportMeta=function(t){this.next();var e=this.containsEsc;return t.property=this.parseIdent(!0),"meta"!==t.property.name&&this.raiseRecoverable(t.property.start,"The only valid meta property for import is 'import.meta'"),e&&this.raiseRecoverable(t.start,"'import.meta' must not contain escaped characters"),"module"===this.options.sourceType||this.options.allowImportExportEverywhere||this.raiseRecoverable(t.start,"Cannot use 'import.meta' outside a module"),this.finishNode(t,"MetaProperty")},ht.parseLiteral=function(t){var e=this.startNode();return e.value=t,e.raw=this.input.slice(this.start,this.end),110===e.raw.charCodeAt(e.raw.length-1)&&(e.bigint=null!=e.value?e.value.toString():e.raw.slice(0,-1).replace(/_/g,"")),this.next(),this.finishNode(e,"Literal")},ht.parseParenExpression=function(){this.expect(y.parenL);var t=this.parseExpression();return this.expect(y.parenR),t},ht.shouldParseArrow=function(t){return!this.canInsertSemicolon()},ht.parseParenAndDistinguishExpression=function(t,e){var i,s=this.start,r=this.startLoc,a=this.options.ecmaVersion>=8;if(this.options.ecmaVersion>=6){this.next();var n,o=this.start,h=this.startLoc,p=[],c=!0,u=!1,l=new Y,d=this.yieldPos,f=this.awaitPos;for(this.yieldPos=0,this.awaitPos=0;this.type!==y.parenR;){if(c?c=!1:this.expect(y.comma),a&&this.afterTrailingComma(y.parenR,!0)){u=!0;break}if(this.type===y.ellipsis){n=this.start,p.push(this.parseParenItem(this.parseRestBinding())),this.type===y.comma&&this.raiseRecoverable(this.start,"Comma is not permitted after the rest element");break}p.push(this.parseMaybeAssign(!1,l,this.parseParenItem))}var m=this.lastTokEnd,g=this.lastTokEndLoc;if(this.expect(y.parenR),t&&this.shouldParseArrow(p)&&this.eat(y.arrow))return this.checkPatternErrors(l,!1),this.checkYieldAwaitInDefaultParams(),this.yieldPos=d,this.awaitPos=f,this.parseParenArrowList(s,r,p,e);p.length&&!u||this.unexpected(this.lastTokStart),n&&this.unexpected(n),this.checkExpressionErrors(l,!0),this.yieldPos=d||this.yieldPos,this.awaitPos=f||this.awaitPos,p.length>1?((i=this.startNodeAt(o,h)).expressions=p,this.finishNodeAt(i,"SequenceExpression",m,g)):i=p[0]}else i=this.parseParenExpression();if(this.options.preserveParens){var x=this.startNodeAt(s,r);return x.expression=i,this.finishNode(x,"ParenthesizedExpression")}return i},ht.parseParenItem=function(t){return t},ht.parseParenArrowList=function(t,e,i,s){return this.parseArrowExpression(this.startNodeAt(t,e),i,!1,s)};var ut=[];ht.parseNew=function(){this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword new");var t=this.startNode();if(this.next(),this.options.ecmaVersion>=6&&this.type===y.dot){var e=this.startNodeAt(t.start,t.loc&&t.loc.start);e.name="new",t.meta=this.finishNode(e,"Identifier"),this.next();var i=this.containsEsc;return t.property=this.parseIdent(!0),"target"!==t.property.name&&this.raiseRecoverable(t.property.start,"The only valid meta property for new is 'new.target'"),i&&this.raiseRecoverable(t.start,"'new.target' must not contain escaped characters"),this.allowNewDotTarget||this.raiseRecoverable(t.start,"'new.target' can only be used in functions and class static block"),this.finishNode(t,"MetaProperty")}var s=this.start,r=this.startLoc;return t.callee=this.parseSubscripts(this.parseExprAtom(null,!1,!0),s,r,!0,!1),"Super"===t.callee.type&&this.raiseRecoverable(s,"Invalid use of 'super'"),this.eat(y.parenL)?t.arguments=this.parseExprList(y.parenR,this.options.ecmaVersion>=8,!1):t.arguments=ut,this.finishNode(t,"NewExpression")},ht.parseTemplateElement=function(t){var e=t.isTagged,i=this.startNode();return this.type===y.invalidTemplate?(e||this.raiseRecoverable(this.start,"Bad escape sequence in untagged template literal"),i.value={raw:this.value.replace(/\r\n?/g,"\n"),cooked:null}):i.value={raw:this.input.slice(this.start,this.end).replace(/\r\n?/g,"\n"),cooked:this.value},this.next(),i.tail=this.type===y.backQuote,this.finishNode(i,"TemplateElement")},ht.parseTemplate=function(t){void 0===t&&(t={});var e=t.isTagged;void 0===e&&(e=!1);var i=this.startNode();this.next(),i.expressions=[];var s=this.parseTemplateElement({isTagged:e});for(i.quasis=[s];!s.tail;)this.type===y.eof&&this.raise(this.pos,"Unterminated template literal"),this.expect(y.dollarBraceL),i.expressions.push(this.parseExpression()),this.expect(y.braceR),i.quasis.push(s=this.parseTemplateElement({isTagged:e}));return this.next(),this.finishNode(i,"TemplateLiteral")},ht.isAsyncProp=function(t){return!t.computed&&"Identifier"===t.key.type&&"async"===t.key.name&&(this.type===y.name||this.type===y.num||this.type===y.string||this.type===y.bracketL||this.type.keyword||this.options.ecmaVersion>=9&&this.type===y.star)&&!b.test(this.input.slice(this.lastTokEnd,this.start))},ht.parseObj=function(t,e){var i=this.startNode(),s=!0,r={};for(i.properties=[],this.next();!this.eat(y.braceR);){if(s)s=!1;else if(this.expect(y.comma),this.options.ecmaVersion>=5&&this.afterTrailingComma(y.braceR))break;var a=this.parseProperty(t,e);t||this.checkPropClash(a,r,e),i.properties.push(a)}return this.finishNode(i,t?"ObjectPattern":"ObjectExpression")},ht.parseProperty=function(t,e){var i,s,r,a,n=this.startNode();if(this.options.ecmaVersion>=9&&this.eat(y.ellipsis))return t?(n.argument=this.parseIdent(!1),this.type===y.comma&&this.raiseRecoverable(this.start,"Comma is not permitted after the rest element"),this.finishNode(n,"RestElement")):(n.argument=this.parseMaybeAssign(!1,e),this.type===y.comma&&e&&e.trailingComma<0&&(e.trailingComma=this.start),this.finishNode(n,"SpreadElement"));this.options.ecmaVersion>=6&&(n.method=!1,n.shorthand=!1,(t||e)&&(r=this.start,a=this.startLoc),t||(i=this.eat(y.star)));var o=this.containsEsc;return this.parsePropertyName(n),!t&&!o&&this.options.ecmaVersion>=8&&!i&&this.isAsyncProp(n)?(s=!0,i=this.options.ecmaVersion>=9&&this.eat(y.star),this.parsePropertyName(n)):s=!1,this.parsePropertyValue(n,t,i,s,r,a,e,o),this.finishNode(n,"Property")},ht.parseGetterSetter=function(t){var e=t.key.name;this.parsePropertyName(t),t.value=this.parseMethod(!1),t.kind=e;var i="get"===t.kind?0:1;if(t.value.params.length!==i){var s=t.value.start;"get"===t.kind?this.raiseRecoverable(s,"getter should have no params"):this.raiseRecoverable(s,"setter should have exactly one param")}else"set"===t.kind&&"RestElement"===t.value.params[0].type&&this.raiseRecoverable(t.value.params[0].start,"Setter cannot use rest params")},ht.parsePropertyValue=function(t,e,i,s,r,a,n,o){(i||s)&&this.type===y.colon&&this.unexpected(),this.eat(y.colon)?(t.value=e?this.parseMaybeDefault(this.start,this.startLoc):this.parseMaybeAssign(!1,n),t.kind="init"):this.options.ecmaVersion>=6&&this.type===y.parenL?(e&&this.unexpected(),t.method=!0,t.value=this.parseMethod(i,s),t.kind="init"):e||o||!(this.options.ecmaVersion>=5)||t.computed||"Identifier"!==t.key.type||"get"!==t.key.name&&"set"!==t.key.name||this.type===y.comma||this.type===y.braceR||this.type===y.eq?this.options.ecmaVersion>=6&&!t.computed&&"Identifier"===t.key.type?((i||s)&&this.unexpected(),this.checkUnreserved(t.key),"await"!==t.key.name||this.awaitIdentPos||(this.awaitIdentPos=r),e?t.value=this.parseMaybeDefault(r,a,this.copyNode(t.key)):this.type===y.eq&&n?(n.shorthandAssign<0&&(n.shorthandAssign=this.start),t.value=this.parseMaybeDefault(r,a,this.copyNode(t.key))):t.value=this.copyNode(t.key),t.kind="init",t.shorthand=!0):this.unexpected():((i||s)&&this.unexpected(),this.parseGetterSetter(t))},ht.parsePropertyName=function(t){if(this.options.ecmaVersion>=6){if(this.eat(y.bracketL))return t.computed=!0,t.key=this.parseMaybeAssign(),this.expect(y.bracketR),t.key;t.computed=!1}return t.key=this.type===y.num||this.type===y.string?this.parseExprAtom():this.parseIdent("never"!==this.options.allowReserved)},ht.initFunction=function(t){t.id=null,this.options.ecmaVersion>=6&&(t.generator=t.expression=!1),this.options.ecmaVersion>=8&&(t.async=!1)},ht.parseMethod=function(t,e,i){var s=this.startNode(),r=this.yieldPos,a=this.awaitPos,n=this.awaitIdentPos;return this.initFunction(s),this.options.ecmaVersion>=6&&(s.generator=t),this.options.ecmaVersion>=8&&(s.async=!!e),this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,this.enterScope(64|G(e,s.generator)|(i?128:0)),this.expect(y.parenL),s.params=this.parseBindingList(y.parenR,!1,this.options.ecmaVersion>=8),this.checkYieldAwaitInDefaultParams(),this.parseFunctionBody(s,!1,!0,!1),this.yieldPos=r,this.awaitPos=a,this.awaitIdentPos=n,this.finishNode(s,"FunctionExpression")},ht.parseArrowExpression=function(t,e,i,s){var r=this.yieldPos,a=this.awaitPos,n=this.awaitIdentPos;return this.enterScope(16|G(i,!1)),this.initFunction(t),this.options.ecmaVersion>=8&&(t.async=!!i),this.yieldPos=0,this.awaitPos=0,this.awaitIdentPos=0,t.params=this.toAssignableList(e,!0),this.parseFunctionBody(t,!0,!1,s),this.yieldPos=r,this.awaitPos=a,this.awaitIdentPos=n,this.finishNode(t,"ArrowFunctionExpression")},ht.parseFunctionBody=function(t,e,i,s){var r=e&&this.type!==y.braceL,a=this.strict,n=!1;if(r)t.body=this.parseMaybeAssign(s),t.expression=!0,this.checkParams(t,!1);else{var o=this.options.ecmaVersion>=7&&!this.isSimpleParamList(t.params);a&&!o||(n=this.strictDirective(this.end))&&o&&this.raiseRecoverable(t.start,"Illegal 'use strict' directive in function with non-simple parameter list");var h=this.labels;this.labels=[],n&&(this.strict=!0),this.checkParams(t,!a&&!n&&!e&&!i&&this.isSimpleParamList(t.params)),this.strict&&t.id&&this.checkLValSimple(t.id,5),t.body=this.parseBlock(!1,void 0,n&&!a),t.expression=!1,this.adaptDirectivePrologue(t.body.body),this.labels=h}this.exitScope()},ht.isSimpleParamList=function(t){for(var e=0,i=t;e<i.length;e+=1){if("Identifier"!==i[e].type)return!1}return!0},ht.checkParams=function(t,e){for(var i=Object.create(null),s=0,r=t.params;s<r.length;s+=1){var a=r[s];this.checkLValInnerPattern(a,1,e?null:i)}},ht.parseExprList=function(t,e,i,s){for(var r=[],a=!0;!this.eat(t);){if(a)a=!1;else if(this.expect(y.comma),e&&this.afterTrailingComma(t))break;var n=void 0;i&&this.type===y.comma?n=null:this.type===y.ellipsis?(n=this.parseSpread(s),s&&this.type===y.comma&&s.trailingComma<0&&(s.trailingComma=this.start)):n=this.parseMaybeAssign(!1,s),r.push(n)}return r},ht.checkUnreserved=function(t){var e=t.start,i=t.end,s=t.name;(this.inGenerator&&"yield"===s&&this.raiseRecoverable(e,"Cannot use 'yield' as identifier inside a generator"),this.inAsync&&"await"===s&&this.raiseRecoverable(e,"Cannot use 'await' as identifier inside an async function"),this.currentThisScope().flags&j||"arguments"!==s||this.raiseRecoverable(e,"Cannot use 'arguments' in class field initializer"),!this.inClassStaticBlock||"arguments"!==s&&"await"!==s||this.raise(e,"Cannot use "+s+" in class static initialization block"),this.keywords.test(s)&&this.raise(e,"Unexpected keyword '"+s+"'"),this.options.ecmaVersion<6&&-1!==this.input.slice(e,i).indexOf("\\"))||(this.strict?this.reservedWordsStrict:this.reservedWords).test(s)&&(this.inAsync||"await"!==s||this.raiseRecoverable(e,"Cannot use keyword 'await' outside an async function"),this.raiseRecoverable(e,"The keyword '"+s+"' is reserved"))},ht.parseIdent=function(t){var e=this.parseIdentNode();return this.next(!!t),this.finishNode(e,"Identifier"),t||(this.checkUnreserved(e),"await"!==e.name||this.awaitIdentPos||(this.awaitIdentPos=e.start)),e},ht.parseIdentNode=function(){var t=this.startNode();return this.type===y.name?t.name=this.value:this.type.keyword?(t.name=this.type.keyword,"class"!==t.name&&"function"!==t.name||this.lastTokEnd===this.lastTokStart+1&&46===this.input.charCodeAt(this.lastTokStart)||this.context.pop(),this.type=y.name):this.unexpected(),t},ht.parsePrivateIdent=function(){var t=this.startNode();return this.type===y.privateId?t.name=this.value:this.unexpected(),this.next(),this.finishNode(t,"PrivateIdentifier"),this.options.checkPrivateFields&&(0===this.privateNameStack.length?this.raise(t.start,"Private field '#"+t.name+"' must be declared in an enclosing class"):this.privateNameStack[this.privateNameStack.length-1].used.push(t)),t},ht.parseYield=function(t){this.yieldPos||(this.yieldPos=this.start);var e=this.startNode();return this.next(),this.type===y.semi||this.canInsertSemicolon()||this.type!==y.star&&!this.type.startsExpr?(e.delegate=!1,e.argument=null):(e.delegate=this.eat(y.star),e.argument=this.parseMaybeAssign(t)),this.finishNode(e,"YieldExpression")},ht.parseAwait=function(t){this.awaitPos||(this.awaitPos=this.start);var e=this.startNode();return this.next(),e.argument=this.parseMaybeUnary(null,!0,!1,t),this.finishNode(e,"AwaitExpression")};var lt=H.prototype;lt.raise=function(t,e){var i=B(this.input,t);e+=" ("+i.line+":"+i.column+")",this.sourceFile&&(e+=" in "+this.sourceFile);var s=new SyntaxError(e);throw s.pos=t,s.loc=i,s.raisedAt=this.pos,s},lt.raiseRecoverable=lt.raise,lt.curPosition=function(){if(this.options.locations)return new D(this.curLine,this.pos-this.lineStart)};var dt=H.prototype,ft=function(t){this.flags=t,this.var=[],this.lexical=[],this.functions=[]};dt.enterScope=function(t){this.scopeStack.push(new ft(t))},dt.exitScope=function(){this.scopeStack.pop()},dt.treatFunctionsAsVarInScope=function(t){return 2&t.flags||!this.inModule&&1&t.flags},dt.declareName=function(t,e,i){var s=!1;if(2===e){var r=this.currentScope();s=r.lexical.indexOf(t)>-1||r.functions.indexOf(t)>-1||r.var.indexOf(t)>-1,r.lexical.push(t),this.inModule&&1&r.flags&&delete this.undefinedExports[t]}else if(4===e){this.currentScope().lexical.push(t)}else if(3===e){var a=this.currentScope();s=this.treatFunctionsAsVar?a.lexical.indexOf(t)>-1:a.lexical.indexOf(t)>-1||a.var.indexOf(t)>-1,a.functions.push(t)}else for(var n=this.scopeStack.length-1;n>=0;--n){var o=this.scopeStack[n];if(o.lexical.indexOf(t)>-1&&!(32&o.flags&&o.lexical[0]===t)||!this.treatFunctionsAsVarInScope(o)&&o.functions.indexOf(t)>-1){s=!0;break}if(o.var.push(t),this.inModule&&1&o.flags&&delete this.undefinedExports[t],o.flags&j)break}s&&this.raiseRecoverable(i,"Identifier '"+t+"' has already been declared")},dt.checkLocalExport=function(t){-1===this.scopeStack[0].lexical.indexOf(t.name)&&-1===this.scopeStack[0].var.indexOf(t.name)&&(this.undefinedExports[t.name]=t)},dt.currentScope=function(){return this.scopeStack[this.scopeStack.length-1]},dt.currentVarScope=function(){for(var t=this.scopeStack.length-1;;t--){var e=this.scopeStack[t];if(771&e.flags)return e}},dt.currentThisScope=function(){for(var t=this.scopeStack.length-1;;t--){var e=this.scopeStack[t];if(771&e.flags&&!(16&e.flags))return e}};var mt=function(t,e,i){this.type="",this.start=e,this.end=0,t.options.locations&&(this.loc=new O(t,i)),t.options.directSourceFile&&(this.sourceFile=t.options.directSourceFile),t.options.ranges&&(this.range=[e,0])},gt=H.prototype;function xt(t,e,i,s){return t.type=e,t.end=i,this.options.locations&&(t.loc.end=s),this.options.ranges&&(t.range[1]=i),t}gt.startNode=function(){return new mt(this,this.start,this.startLoc)},gt.startNodeAt=function(t,e){return new mt(this,t,e)},gt.finishNode=function(t,e){return xt.call(this,t,e,this.lastTokEnd,this.lastTokEndLoc)},gt.finishNodeAt=function(t,e,i,s){return xt.call(this,t,e,i,s)},gt.copyNode=function(t){var e=new mt(this,t.start,this.startLoc);for(var i in t)e[i]=t[i];return e};var vt="ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS",yt=vt+" Extended_Pictographic",bt=yt+" EBase EComp EMod EPres ExtPict",kt={9:vt,10:yt,11:yt,12:bt,13:bt,14:bt},_t={9:"",10:"",11:"",12:"",13:"",14:"Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji"},St="Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu",Ct="Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb",wt=Ct+" Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd",Et=wt+" Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho",At=Et+" Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi",It=At+" Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith",Pt={9:Ct,10:wt,11:Et,12:At,13:It,14:It+" Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz"},Vt={};function Nt(t){var e=Vt[t]={binary:T(kt[t]+" "+St),binaryOfStrings:T(_t[t]),nonBinary:{General_Category:T(St),Script:T(Pt[t])}};e.nonBinary.Script_Extensions=e.nonBinary.Script,e.nonBinary.gc=e.nonBinary.General_Category,e.nonBinary.sc=e.nonBinary.Script,e.nonBinary.scx=e.nonBinary.Script_Extensions}for(var Tt=0,Lt=[9,10,11,12,13,14];Tt<Lt.length;Tt+=1){Nt(Lt[Tt])}var Rt=H.prototype,Dt=function(t,e){this.parent=t,this.base=e||this};Dt.prototype.separatedFrom=function(t){for(var e=this;e;e=e.parent)for(var i=t;i;i=i.parent)if(e.base===i.base&&e!==i)return!0;return!1},Dt.prototype.sibling=function(){return new Dt(this.parent,this.base)};var Ot=function(t){this.parser=t,this.validFlags="gim"+(t.options.ecmaVersion>=6?"uy":"")+(t.options.ecmaVersion>=9?"s":"")+(t.options.ecmaVersion>=13?"d":"")+(t.options.ecmaVersion>=15?"v":""),this.unicodeProperties=Vt[t.options.ecmaVersion>=14?14:t.options.ecmaVersion],this.source="",this.flags="",this.start=0,this.switchU=!1,this.switchV=!1,this.switchN=!1,this.pos=0,this.lastIntValue=0,this.lastStringValue="",this.lastAssertionIsQuantifiable=!1,this.numCapturingParens=0,this.maxBackReference=0,this.groupNames=Object.create(null),this.backReferenceNames=[],this.branchID=null};function Bt(t){return 105===t||109===t||115===t}function Mt(t){return 36===t||t>=40&&t<=43||46===t||63===t||t>=91&&t<=94||t>=123&&t<=125}function Ft(t){return t>=65&&t<=90||t>=97&&t<=122}Ot.prototype.reset=function(t,e,i){var s=-1!==i.indexOf("v"),r=-1!==i.indexOf("u");this.start=0|t,this.source=e+"",this.flags=i,s&&this.parser.options.ecmaVersion>=15?(this.switchU=!0,this.switchV=!0,this.switchN=!0):(this.switchU=r&&this.parser.options.ecmaVersion>=6,this.switchV=!1,this.switchN=r&&this.parser.options.ecmaVersion>=9)},Ot.prototype.raise=function(t){this.parser.raiseRecoverable(this.start,"Invalid regular expression: /"+this.source+"/: "+t)},Ot.prototype.at=function(t,e){void 0===e&&(e=!1);var i=this.source,s=i.length;if(t>=s)return-1;var r=i.charCodeAt(t);if(!e&&!this.switchU||r<=55295||r>=57344||t+1>=s)return r;var a=i.charCodeAt(t+1);return a>=56320&&a<=57343?(r<<10)+a-56613888:r},Ot.prototype.nextIndex=function(t,e){void 0===e&&(e=!1);var i=this.source,s=i.length;if(t>=s)return s;var r,a=i.charCodeAt(t);return!e&&!this.switchU||a<=55295||a>=57344||t+1>=s||(r=i.charCodeAt(t+1))<56320||r>57343?t+1:t+2},Ot.prototype.current=function(t){return void 0===t&&(t=!1),this.at(this.pos,t)},Ot.prototype.lookahead=function(t){return void 0===t&&(t=!1),this.at(this.nextIndex(this.pos,t),t)},Ot.prototype.advance=function(t){void 0===t&&(t=!1),this.pos=this.nextIndex(this.pos,t)},Ot.prototype.eat=function(t,e){return void 0===e&&(e=!1),this.current(e)===t&&(this.advance(e),!0)},Ot.prototype.eatChars=function(t,e){void 0===e&&(e=!1);for(var i=this.pos,s=0,r=t;s<r.length;s+=1){var a=r[s],n=this.at(i,e);if(-1===n||n!==a)return!1;i=this.nextIndex(i,e)}return this.pos=i,!0},Rt.validateRegExpFlags=function(t){for(var e=t.validFlags,i=t.flags,s=!1,r=!1,a=0;a<i.length;a++){var n=i.charAt(a);-1===e.indexOf(n)&&this.raise(t.start,"Invalid regular expression flag"),i.indexOf(n,a+1)>-1&&this.raise(t.start,"Duplicate regular expression flag"),"u"===n&&(s=!0),"v"===n&&(r=!0)}this.options.ecmaVersion>=15&&s&&r&&this.raise(t.start,"Invalid regular expression flag")},Rt.validateRegExpPattern=function(t){this.regexp_pattern(t),!t.switchN&&this.options.ecmaVersion>=9&&function(t){for(var e in t)return!0;return!1}(t.groupNames)&&(t.switchN=!0,this.regexp_pattern(t))},Rt.regexp_pattern=function(t){t.pos=0,t.lastIntValue=0,t.lastStringValue="",t.lastAssertionIsQuantifiable=!1,t.numCapturingParens=0,t.maxBackReference=0,t.groupNames=Object.create(null),t.backReferenceNames.length=0,t.branchID=null,this.regexp_disjunction(t),t.pos!==t.source.length&&(t.eat(41)&&t.raise("Unmatched ')'"),(t.eat(93)||t.eat(125))&&t.raise("Lone quantifier brackets")),t.maxBackReference>t.numCapturingParens&&t.raise("Invalid escape");for(var e=0,i=t.backReferenceNames;e<i.length;e+=1){var s=i[e];t.groupNames[s]||t.raise("Invalid named capture referenced")}},Rt.regexp_disjunction=function(t){var e=this.options.ecmaVersion>=16;for(e&&(t.branchID=new Dt(t.branchID,null)),this.regexp_alternative(t);t.eat(124);)e&&(t.branchID=t.branchID.sibling()),this.regexp_alternative(t);e&&(t.branchID=t.branchID.parent),this.regexp_eatQuantifier(t,!0)&&t.raise("Nothing to repeat"),t.eat(123)&&t.raise("Lone quantifier brackets")},Rt.regexp_alternative=function(t){for(;t.pos<t.source.length&&this.regexp_eatTerm(t););},Rt.regexp_eatTerm=function(t){return this.regexp_eatAssertion(t)?(t.lastAssertionIsQuantifiable&&this.regexp_eatQuantifier(t)&&t.switchU&&t.raise("Invalid quantifier"),!0):!!(t.switchU?this.regexp_eatAtom(t):this.regexp_eatExtendedAtom(t))&&(this.regexp_eatQuantifier(t),!0)},Rt.regexp_eatAssertion=function(t){var e=t.pos;if(t.lastAssertionIsQuantifiable=!1,t.eat(94)||t.eat(36))return!0;if(t.eat(92)){if(t.eat(66)||t.eat(98))return!0;t.pos=e}if(t.eat(40)&&t.eat(63)){var i=!1;if(this.options.ecmaVersion>=9&&(i=t.eat(60)),t.eat(61)||t.eat(33))return this.regexp_disjunction(t),t.eat(41)||t.raise("Unterminated group"),t.lastAssertionIsQuantifiable=!i,!0}return t.pos=e,!1},Rt.regexp_eatQuantifier=function(t,e){return void 0===e&&(e=!1),!!this.regexp_eatQuantifierPrefix(t,e)&&(t.eat(63),!0)},Rt.regexp_eatQuantifierPrefix=function(t,e){return t.eat(42)||t.eat(43)||t.eat(63)||this.regexp_eatBracedQuantifier(t,e)},Rt.regexp_eatBracedQuantifier=function(t,e){var i=t.pos;if(t.eat(123)){var s=0,r=-1;if(this.regexp_eatDecimalDigits(t)&&(s=t.lastIntValue,t.eat(44)&&this.regexp_eatDecimalDigits(t)&&(r=t.lastIntValue),t.eat(125)))return-1!==r&&r<s&&!e&&t.raise("numbers out of order in {} quantifier"),!0;t.switchU&&!e&&t.raise("Incomplete quantifier"),t.pos=i}return!1},Rt.regexp_eatAtom=function(t){return this.regexp_eatPatternCharacters(t)||t.eat(46)||this.regexp_eatReverseSolidusAtomEscape(t)||this.regexp_eatCharacterClass(t)||this.regexp_eatUncapturingGroup(t)||this.regexp_eatCapturingGroup(t)},Rt.regexp_eatReverseSolidusAtomEscape=function(t){var e=t.pos;if(t.eat(92)){if(this.regexp_eatAtomEscape(t))return!0;t.pos=e}return!1},Rt.regexp_eatUncapturingGroup=function(t){var e=t.pos;if(t.eat(40)){if(t.eat(63)){if(this.options.ecmaVersion>=16){var i=this.regexp_eatModifiers(t),s=t.eat(45);if(i||s){for(var r=0;r<i.length;r++){var a=i.charAt(r);i.indexOf(a,r+1)>-1&&t.raise("Duplicate regular expression modifiers")}if(s){var n=this.regexp_eatModifiers(t);i||n||58!==t.current()||t.raise("Invalid regular expression modifiers");for(var o=0;o<n.length;o++){var h=n.charAt(o);(n.indexOf(h,o+1)>-1||i.indexOf(h)>-1)&&t.raise("Duplicate regular expression modifiers")}}}}if(t.eat(58)){if(this.regexp_disjunction(t),t.eat(41))return!0;t.raise("Unterminated group")}}t.pos=e}return!1},Rt.regexp_eatCapturingGroup=function(t){if(t.eat(40)){if(this.options.ecmaVersion>=9?this.regexp_groupSpecifier(t):63===t.current()&&t.raise("Invalid group"),this.regexp_disjunction(t),t.eat(41))return t.numCapturingParens+=1,!0;t.raise("Unterminated group")}return!1},Rt.regexp_eatModifiers=function(t){for(var e="",i=0;-1!==(i=t.current())&&Bt(i);)e+=L(i),t.advance();return e},Rt.regexp_eatExtendedAtom=function(t){return t.eat(46)||this.regexp_eatReverseSolidusAtomEscape(t)||this.regexp_eatCharacterClass(t)||this.regexp_eatUncapturingGroup(t)||this.regexp_eatCapturingGroup(t)||this.regexp_eatInvalidBracedQuantifier(t)||this.regexp_eatExtendedPatternCharacter(t)},Rt.regexp_eatInvalidBracedQuantifier=function(t){return this.regexp_eatBracedQuantifier(t,!0)&&t.raise("Nothing to repeat"),!1},Rt.regexp_eatSyntaxCharacter=function(t){var e=t.current();return!!Mt(e)&&(t.lastIntValue=e,t.advance(),!0)},Rt.regexp_eatPatternCharacters=function(t){for(var e=t.pos,i=0;-1!==(i=t.current())&&!Mt(i);)t.advance();return t.pos!==e},Rt.regexp_eatExtendedPatternCharacter=function(t){var e=t.current();return!(-1===e||36===e||e>=40&&e<=43||46===e||63===e||91===e||94===e||124===e)&&(t.advance(),!0)},Rt.regexp_groupSpecifier=function(t){if(t.eat(63)){this.regexp_eatGroupName(t)||t.raise("Invalid group");var e=this.options.ecmaVersion>=16,i=t.groupNames[t.lastStringValue];if(i)if(e)for(var s=0,r=i;s<r.length;s+=1){r[s].separatedFrom(t.branchID)||t.raise("Duplicate capture group name")}else t.raise("Duplicate capture group name");e?(i||(t.groupNames[t.lastStringValue]=[])).push(t.branchID):t.groupNames[t.lastStringValue]=!0}},Rt.regexp_eatGroupName=function(t){if(t.lastStringValue="",t.eat(60)){if(this.regexp_eatRegExpIdentifierName(t)&&t.eat(62))return!0;t.raise("Invalid capture group name")}return!1},Rt.regexp_eatRegExpIdentifierName=function(t){if(t.lastStringValue="",this.regexp_eatRegExpIdentifierStart(t)){for(t.lastStringValue+=L(t.lastIntValue);this.regexp_eatRegExpIdentifierPart(t);)t.lastStringValue+=L(t.lastIntValue);return!0}return!1},Rt.regexp_eatRegExpIdentifierStart=function(t){var e=t.pos,i=this.options.ecmaVersion>=11,s=t.current(i);return t.advance(i),92===s&&this.regexp_eatRegExpUnicodeEscapeSequence(t,i)&&(s=t.lastIntValue),function(t){return u(t,!0)||36===t||95===t}(s)?(t.lastIntValue=s,!0):(t.pos=e,!1)},Rt.regexp_eatRegExpIdentifierPart=function(t){var e=t.pos,i=this.options.ecmaVersion>=11,s=t.current(i);return t.advance(i),92===s&&this.regexp_eatRegExpUnicodeEscapeSequence(t,i)&&(s=t.lastIntValue),function(t){return l(t,!0)||36===t||95===t||8204===t||8205===t}(s)?(t.lastIntValue=s,!0):(t.pos=e,!1)},Rt.regexp_eatAtomEscape=function(t){return!!(this.regexp_eatBackReference(t)||this.regexp_eatCharacterClassEscape(t)||this.regexp_eatCharacterEscape(t)||t.switchN&&this.regexp_eatKGroupName(t))||(t.switchU&&(99===t.current()&&t.raise("Invalid unicode escape"),t.raise("Invalid escape")),!1)},Rt.regexp_eatBackReference=function(t){var e=t.pos;if(this.regexp_eatDecimalEscape(t)){var i=t.lastIntValue;if(t.switchU)return i>t.maxBackReference&&(t.maxBackReference=i),!0;if(i<=t.numCapturingParens)return!0;t.pos=e}return!1},Rt.regexp_eatKGroupName=function(t){if(t.eat(107)){if(this.regexp_eatGroupName(t))return t.backReferenceNames.push(t.lastStringValue),!0;t.raise("Invalid named reference")}return!1},Rt.regexp_eatCharacterEscape=function(t){return this.regexp_eatControlEscape(t)||this.regexp_eatCControlLetter(t)||this.regexp_eatZero(t)||this.regexp_eatHexEscapeSequence(t)||this.regexp_eatRegExpUnicodeEscapeSequence(t,!1)||!t.switchU&&this.regexp_eatLegacyOctalEscapeSequence(t)||this.regexp_eatIdentityEscape(t)},Rt.regexp_eatCControlLetter=function(t){var e=t.pos;if(t.eat(99)){if(this.regexp_eatControlLetter(t))return!0;t.pos=e}return!1},Rt.regexp_eatZero=function(t){return 48===t.current()&&!jt(t.lookahead())&&(t.lastIntValue=0,t.advance(),!0)},Rt.regexp_eatControlEscape=function(t){var e=t.current();return 116===e?(t.lastIntValue=9,t.advance(),!0):110===e?(t.lastIntValue=10,t.advance(),!0):118===e?(t.lastIntValue=11,t.advance(),!0):102===e?(t.lastIntValue=12,t.advance(),!0):114===e&&(t.lastIntValue=13,t.advance(),!0)},Rt.regexp_eatControlLetter=function(t){var e=t.current();return!!Ft(e)&&(t.lastIntValue=e%32,t.advance(),!0)},Rt.regexp_eatRegExpUnicodeEscapeSequence=function(t,e){void 0===e&&(e=!1);var i,s=t.pos,r=e||t.switchU;if(t.eat(117)){if(this.regexp_eatFixedHexDigits(t,4)){var a=t.lastIntValue;if(r&&a>=55296&&a<=56319){var n=t.pos;if(t.eat(92)&&t.eat(117)&&this.regexp_eatFixedHexDigits(t,4)){var o=t.lastIntValue;if(o>=56320&&o<=57343)return t.lastIntValue=1024*(a-55296)+(o-56320)+65536,!0}t.pos=n,t.lastIntValue=a}return!0}if(r&&t.eat(123)&&this.regexp_eatHexDigits(t)&&t.eat(125)&&((i=t.lastIntValue)>=0&&i<=1114111))return!0;r&&t.raise("Invalid unicode escape"),t.pos=s}return!1},Rt.regexp_eatIdentityEscape=function(t){if(t.switchU)return!!this.regexp_eatSyntaxCharacter(t)||!!t.eat(47)&&(t.lastIntValue=47,!0);var e=t.current();return!(99===e||t.switchN&&107===e)&&(t.lastIntValue=e,t.advance(),!0)},Rt.regexp_eatDecimalEscape=function(t){t.lastIntValue=0;var e=t.current();if(e>=49&&e<=57){do{t.lastIntValue=10*t.lastIntValue+(e-48),t.advance()}while((e=t.current())>=48&&e<=57);return!0}return!1};function Ut(t){return Ft(t)||95===t}function qt(t){return Ut(t)||jt(t)}function jt(t){return t>=48&&t<=57}function Gt(t){return t>=48&&t<=57||t>=65&&t<=70||t>=97&&t<=102}function Ht(t){return t>=65&&t<=70?t-65+10:t>=97&&t<=102?t-97+10:t-48}function Wt(t){return t>=48&&t<=55}Rt.regexp_eatCharacterClassEscape=function(t){var e=t.current();if(function(t){return 100===t||68===t||115===t||83===t||119===t||87===t}(e))return t.lastIntValue=-1,t.advance(),1;var i=!1;if(t.switchU&&this.options.ecmaVersion>=9&&((i=80===e)||112===e)){var s;if(t.lastIntValue=-1,t.advance(),t.eat(123)&&(s=this.regexp_eatUnicodePropertyValueExpression(t))&&t.eat(125))return i&&2===s&&t.raise("Invalid property name"),s;t.raise("Invalid property name")}return 0},Rt.regexp_eatUnicodePropertyValueExpression=function(t){var e=t.pos;if(this.regexp_eatUnicodePropertyName(t)&&t.eat(61)){var i=t.lastStringValue;if(this.regexp_eatUnicodePropertyValue(t)){var s=t.lastStringValue;return this.regexp_validateUnicodePropertyNameAndValue(t,i,s),1}}if(t.pos=e,this.regexp_eatLoneUnicodePropertyNameOrValue(t)){var r=t.lastStringValue;return this.regexp_validateUnicodePropertyNameOrValue(t,r)}return 0},Rt.regexp_validateUnicodePropertyNameAndValue=function(t,e,i){P(t.unicodeProperties.nonBinary,e)||t.raise("Invalid property name"),t.unicodeProperties.nonBinary[e].test(i)||t.raise("Invalid property value")},Rt.regexp_validateUnicodePropertyNameOrValue=function(t,e){return t.unicodeProperties.binary.test(e)?1:t.switchV&&t.unicodeProperties.binaryOfStrings.test(e)?2:void t.raise("Invalid property name")},Rt.regexp_eatUnicodePropertyName=function(t){var e=0;for(t.lastStringValue="";Ut(e=t.current());)t.lastStringValue+=L(e),t.advance();return""!==t.lastStringValue},Rt.regexp_eatUnicodePropertyValue=function(t){var e=0;for(t.lastStringValue="";qt(e=t.current());)t.lastStringValue+=L(e),t.advance();return""!==t.lastStringValue},Rt.regexp_eatLoneUnicodePropertyNameOrValue=function(t){return this.regexp_eatUnicodePropertyValue(t)},Rt.regexp_eatCharacterClass=function(t){if(t.eat(91)){var e=t.eat(94),i=this.regexp_classContents(t);return t.eat(93)||t.raise("Unterminated character class"),e&&2===i&&t.raise("Negated character class may contain strings"),!0}return!1},Rt.regexp_classContents=function(t){return 93===t.current()?1:t.switchV?this.regexp_classSetExpression(t):(this.regexp_nonEmptyClassRanges(t),1)},Rt.regexp_nonEmptyClassRanges=function(t){for(;this.regexp_eatClassAtom(t);){var e=t.lastIntValue;if(t.eat(45)&&this.regexp_eatClassAtom(t)){var i=t.lastIntValue;!t.switchU||-1!==e&&-1!==i||t.raise("Invalid character class"),-1!==e&&-1!==i&&e>i&&t.raise("Range out of order in character class")}}},Rt.regexp_eatClassAtom=function(t){var e=t.pos;if(t.eat(92)){if(this.regexp_eatClassEscape(t))return!0;if(t.switchU){var i=t.current();(99===i||Wt(i))&&t.raise("Invalid class escape"),t.raise("Invalid escape")}t.pos=e}var s=t.current();return 93!==s&&(t.lastIntValue=s,t.advance(),!0)},Rt.regexp_eatClassEscape=function(t){var e=t.pos;if(t.eat(98))return t.lastIntValue=8,!0;if(t.switchU&&t.eat(45))return t.lastIntValue=45,!0;if(!t.switchU&&t.eat(99)){if(this.regexp_eatClassControlLetter(t))return!0;t.pos=e}return this.regexp_eatCharacterClassEscape(t)||this.regexp_eatCharacterEscape(t)},Rt.regexp_classSetExpression=function(t){var e,i=1;if(this.regexp_eatClassSetRange(t));else if(e=this.regexp_eatClassSetOperand(t)){2===e&&(i=2);for(var s=t.pos;t.eatChars([38,38]);)38!==t.current()&&(e=this.regexp_eatClassSetOperand(t))?2!==e&&(i=1):t.raise("Invalid character in character class");if(s!==t.pos)return i;for(;t.eatChars([45,45]);)this.regexp_eatClassSetOperand(t)||t.raise("Invalid character in character class");if(s!==t.pos)return i}else t.raise("Invalid character in character class");for(;;)if(!this.regexp_eatClassSetRange(t)){if(!(e=this.regexp_eatClassSetOperand(t)))return i;2===e&&(i=2)}},Rt.regexp_eatClassSetRange=function(t){var e=t.pos;if(this.regexp_eatClassSetCharacter(t)){var i=t.lastIntValue;if(t.eat(45)&&this.regexp_eatClassSetCharacter(t)){var s=t.lastIntValue;return-1!==i&&-1!==s&&i>s&&t.raise("Range out of order in character class"),!0}t.pos=e}return!1},Rt.regexp_eatClassSetOperand=function(t){return this.regexp_eatClassSetCharacter(t)?1:this.regexp_eatClassStringDisjunction(t)||this.regexp_eatNestedClass(t)},Rt.regexp_eatNestedClass=function(t){var e=t.pos;if(t.eat(91)){var i=t.eat(94),s=this.regexp_classContents(t);if(t.eat(93))return i&&2===s&&t.raise("Negated character class may contain strings"),s;t.pos=e}if(t.eat(92)){var r=this.regexp_eatCharacterClassEscape(t);if(r)return r;t.pos=e}return null},Rt.regexp_eatClassStringDisjunction=function(t){var e=t.pos;if(t.eatChars([92,113])){if(t.eat(123)){var i=this.regexp_classStringDisjunctionContents(t);if(t.eat(125))return i}else t.raise("Invalid escape");t.pos=e}return null},Rt.regexp_classStringDisjunctionContents=function(t){for(var e=this.regexp_classString(t);t.eat(124);)2===this.regexp_classString(t)&&(e=2);return e},Rt.regexp_classString=function(t){for(var e=0;this.regexp_eatClassSetCharacter(t);)e++;return 1===e?1:2},Rt.regexp_eatClassSetCharacter=function(t){var e=t.pos;if(t.eat(92))return!(!this.regexp_eatCharacterEscape(t)&&!this.regexp_eatClassSetReservedPunctuator(t))||(t.eat(98)?(t.lastIntValue=8,!0):(t.pos=e,!1));var i=t.current();return!(i<0||i===t.lookahead()&&function(t){return 33===t||t>=35&&t<=38||t>=42&&t<=44||46===t||t>=58&&t<=64||94===t||96===t||126===t}(i))&&(!function(t){return 40===t||41===t||45===t||47===t||t>=91&&t<=93||t>=123&&t<=125}(i)&&(t.advance(),t.lastIntValue=i,!0))},Rt.regexp_eatClassSetReservedPunctuator=function(t){var e=t.current();return!!function(t){return 33===t||35===t||37===t||38===t||44===t||45===t||t>=58&&t<=62||64===t||96===t||126===t}(e)&&(t.lastIntValue=e,t.advance(),!0)},Rt.regexp_eatClassControlLetter=function(t){var e=t.current();return!(!jt(e)&&95!==e)&&(t.lastIntValue=e%32,t.advance(),!0)},Rt.regexp_eatHexEscapeSequence=function(t){var e=t.pos;if(t.eat(120)){if(this.regexp_eatFixedHexDigits(t,2))return!0;t.switchU&&t.raise("Invalid escape"),t.pos=e}return!1},Rt.regexp_eatDecimalDigits=function(t){var e=t.pos,i=0;for(t.lastIntValue=0;jt(i=t.current());)t.lastIntValue=10*t.lastIntValue+(i-48),t.advance();return t.pos!==e},Rt.regexp_eatHexDigits=function(t){var e=t.pos,i=0;for(t.lastIntValue=0;Gt(i=t.current());)t.lastIntValue=16*t.lastIntValue+Ht(i),t.advance();return t.pos!==e},Rt.regexp_eatLegacyOctalEscapeSequence=function(t){if(this.regexp_eatOctalDigit(t)){var e=t.lastIntValue;if(this.regexp_eatOctalDigit(t)){var i=t.lastIntValue;e<=3&&this.regexp_eatOctalDigit(t)?t.lastIntValue=64*e+8*i+t.lastIntValue:t.lastIntValue=8*e+i}else t.lastIntValue=e;return!0}return!1},Rt.regexp_eatOctalDigit=function(t){var e=t.current();return Wt(e)?(t.lastIntValue=e-48,t.advance(),!0):(t.lastIntValue=0,!1)},Rt.regexp_eatFixedHexDigits=function(t,e){var i=t.pos;t.lastIntValue=0;for(var s=0;s<e;++s){var r=t.current();if(!Gt(r))return t.pos=i,!1;t.lastIntValue=16*t.lastIntValue+Ht(r),t.advance()}return!0};var zt=function(t){this.type=t.type,this.value=t.value,this.start=t.start,this.end=t.end,t.options.locations&&(this.loc=new O(t,t.startLoc,t.endLoc)),t.options.ranges&&(this.range=[t.start,t.end])},Kt=H.prototype;function Qt(t){return"function"!=typeof BigInt?null:BigInt(t.replace(/_/g,""))}Kt.next=function(t){!t&&this.type.keyword&&this.containsEsc&&this.raiseRecoverable(this.start,"Escape sequence in keyword "+this.type.keyword),this.options.onToken&&this.options.onToken(new zt(this)),this.lastTokEnd=this.end,this.lastTokStart=this.start,this.lastTokEndLoc=this.endLoc,this.lastTokStartLoc=this.startLoc,this.nextToken()},Kt.getToken=function(){return this.next(),new zt(this)},"undefined"!=typeof Symbol&&(Kt[Symbol.iterator]=function(){var t=this;return{next:function(){var e=t.getToken();return{done:e.type===y.eof,value:e}}}}),Kt.nextToken=function(){var t=this.curContext();return t&&t.preserveSpace||this.skipSpace(),this.start=this.pos,this.options.locations&&(this.startLoc=this.curPosition()),this.pos>=this.input.length?this.finishToken(y.eof):t.override?t.override(this):void this.readToken(this.fullCharCodeAtPos())},Kt.readToken=function(t){return u(t,this.options.ecmaVersion>=6)||92===t?this.readWord():this.getTokenFromCode(t)},Kt.fullCharCodeAt=function(t){var e=this.input.charCodeAt(t);if(e<=55295||e>=56320)return e;var i=this.input.charCodeAt(t+1);return i<=56319||i>=57344?e:(e<<10)+i-56613888},Kt.fullCharCodeAtPos=function(){return this.fullCharCodeAt(this.pos)},Kt.skipBlockComment=function(){var t=this.options.onComment&&this.curPosition(),e=this.pos,i=this.input.indexOf("*/",this.pos+=2);if(-1===i&&this.raise(this.pos-2,"Unterminated comment"),this.pos=i+2,this.options.locations)for(var s=void 0,r=e;(s=S(this.input,r,this.pos))>-1;)++this.curLine,r=this.lineStart=s;this.options.onComment&&this.options.onComment(!0,this.input.slice(e+2,i),e,this.pos,t,this.curPosition())},Kt.skipLineComment=function(t){for(var e=this.pos,i=this.options.onComment&&this.curPosition(),s=this.input.charCodeAt(this.pos+=t);this.pos<this.input.length&&!_(s);)s=this.input.charCodeAt(++this.pos);this.options.onComment&&this.options.onComment(!1,this.input.slice(e+t,this.pos),e,this.pos,i,this.curPosition())},Kt.skipSpace=function(){t:for(;this.pos<this.input.length;){var t=this.input.charCodeAt(this.pos);switch(t){case 32:case 160:++this.pos;break;case 13:10===this.input.charCodeAt(this.pos+1)&&++this.pos;case 10:case 8232:case 8233:++this.pos,this.options.locations&&(++this.curLine,this.lineStart=this.pos);break;case 47:switch(this.input.charCodeAt(this.pos+1)){case 42:this.skipBlockComment();break;case 47:this.skipLineComment(2);break;default:break t}break;default:if(!(t>8&&t<14||t>=5760&&C.test(String.fromCharCode(t))))break t;++this.pos}}},Kt.finishToken=function(t,e){this.end=this.pos,this.options.locations&&(this.endLoc=this.curPosition());var i=this.type;this.type=t,this.value=e,this.updateContext(i)},Kt.readToken_dot=function(){var t=this.input.charCodeAt(this.pos+1);if(t>=48&&t<=57)return this.readNumber(!0);var e=this.input.charCodeAt(this.pos+2);return this.options.ecmaVersion>=6&&46===t&&46===e?(this.pos+=3,this.finishToken(y.ellipsis)):(++this.pos,this.finishToken(y.dot))},Kt.readToken_slash=function(){var t=this.input.charCodeAt(this.pos+1);return this.exprAllowed?(++this.pos,this.readRegexp()):61===t?this.finishOp(y.assign,2):this.finishOp(y.slash,1)},Kt.readToken_mult_modulo_exp=function(t){var e=this.input.charCodeAt(this.pos+1),i=1,s=42===t?y.star:y.modulo;return this.options.ecmaVersion>=7&&42===t&&42===e&&(++i,s=y.starstar,e=this.input.charCodeAt(this.pos+2)),61===e?this.finishOp(y.assign,i+1):this.finishOp(s,i)},Kt.readToken_pipe_amp=function(t){var e=this.input.charCodeAt(this.pos+1);if(e===t){if(this.options.ecmaVersion>=12)if(61===this.input.charCodeAt(this.pos+2))return this.finishOp(y.assign,3);return this.finishOp(124===t?y.logicalOR:y.logicalAND,2)}return 61===e?this.finishOp(y.assign,2):this.finishOp(124===t?y.bitwiseOR:y.bitwiseAND,1)},Kt.readToken_caret=function(){return 61===this.input.charCodeAt(this.pos+1)?this.finishOp(y.assign,2):this.finishOp(y.bitwiseXOR,1)},Kt.readToken_plus_min=function(t){var e=this.input.charCodeAt(this.pos+1);return e===t?45!==e||this.inModule||62!==this.input.charCodeAt(this.pos+2)||0!==this.lastTokEnd&&!b.test(this.input.slice(this.lastTokEnd,this.pos))?this.finishOp(y.incDec,2):(this.skipLineComment(3),this.skipSpace(),this.nextToken()):61===e?this.finishOp(y.assign,2):this.finishOp(y.plusMin,1)},Kt.readToken_lt_gt=function(t){var e=this.input.charCodeAt(this.pos+1),i=1;return e===t?(i=62===t&&62===this.input.charCodeAt(this.pos+2)?3:2,61===this.input.charCodeAt(this.pos+i)?this.finishOp(y.assign,i+1):this.finishOp(y.bitShift,i)):33!==e||60!==t||this.inModule||45!==this.input.charCodeAt(this.pos+2)||45!==this.input.charCodeAt(this.pos+3)?(61===e&&(i=2),this.finishOp(y.relational,i)):(this.skipLineComment(4),this.skipSpace(),this.nextToken())},Kt.readToken_eq_excl=function(t){var e=this.input.charCodeAt(this.pos+1);return 61===e?this.finishOp(y.equality,61===this.input.charCodeAt(this.pos+2)?3:2):61===t&&62===e&&this.options.ecmaVersion>=6?(this.pos+=2,this.finishToken(y.arrow)):this.finishOp(61===t?y.eq:y.prefix,1)},Kt.readToken_question=function(){var t=this.options.ecmaVersion;if(t>=11){var e=this.input.charCodeAt(this.pos+1);if(46===e){var i=this.input.charCodeAt(this.pos+2);if(i<48||i>57)return this.finishOp(y.questionDot,2)}if(63===e){if(t>=12)if(61===this.input.charCodeAt(this.pos+2))return this.finishOp(y.assign,3);return this.finishOp(y.coalesce,2)}}return this.finishOp(y.question,1)},Kt.readToken_numberSign=function(){var t=35;if(this.options.ecmaVersion>=13&&(++this.pos,u(t=this.fullCharCodeAtPos(),!0)||92===t))return this.finishToken(y.privateId,this.readWord1());this.raise(this.pos,"Unexpected character '"+L(t)+"'")},Kt.getTokenFromCode=function(t){switch(t){case 46:return this.readToken_dot();case 40:return++this.pos,this.finishToken(y.parenL);case 41:return++this.pos,this.finishToken(y.parenR);case 59:return++this.pos,this.finishToken(y.semi);case 44:return++this.pos,this.finishToken(y.comma);case 91:return++this.pos,this.finishToken(y.bracketL);case 93:return++this.pos,this.finishToken(y.bracketR);case 123:return++this.pos,this.finishToken(y.braceL);case 125:return++this.pos,this.finishToken(y.braceR);case 58:return++this.pos,this.finishToken(y.colon);case 96:if(this.options.ecmaVersion<6)break;return++this.pos,this.finishToken(y.backQuote);case 48:var e=this.input.charCodeAt(this.pos+1);if(120===e||88===e)return this.readRadixNumber(16);if(this.options.ecmaVersion>=6){if(111===e||79===e)return this.readRadixNumber(8);if(98===e||66===e)return this.readRadixNumber(2)}case 49:case 50:case 51:case 52:case 53:case 54:case 55:case 56:case 57:return this.readNumber(!1);case 34:case 39:return this.readString(t);case 47:return this.readToken_slash();case 37:case 42:return this.readToken_mult_modulo_exp(t);case 124:case 38:return this.readToken_pipe_amp(t);case 94:return this.readToken_caret();case 43:case 45:return this.readToken_plus_min(t);case 60:case 62:return this.readToken_lt_gt(t);case 61:case 33:return this.readToken_eq_excl(t);case 63:return this.readToken_question();case 126:return this.finishOp(y.prefix,1);case 35:return this.readToken_numberSign()}this.raise(this.pos,"Unexpected character '"+L(t)+"'")},Kt.finishOp=function(t,e){var i=this.input.slice(this.pos,this.pos+e);return this.pos+=e,this.finishToken(t,i)},Kt.readRegexp=function(){for(var t,e,i=this.pos;;){this.pos>=this.input.length&&this.raise(i,"Unterminated regular expression");var s=this.input.charAt(this.pos);if(b.test(s)&&this.raise(i,"Unterminated regular expression"),t)t=!1;else{if("["===s)e=!0;else if("]"===s&&e)e=!1;else if("/"===s&&!e)break;t="\\"===s}++this.pos}var r=this.input.slice(i,this.pos);++this.pos;var a=this.pos,n=this.readWord1();this.containsEsc&&this.unexpected(a);var o=this.regexpState||(this.regexpState=new Ot(this));o.reset(i,r,n),this.validateRegExpFlags(o),this.validateRegExpPattern(o);var h=null;try{h=new RegExp(r,n)}catch(t){}return this.finishToken(y.regexp,{pattern:r,flags:n,value:h})},Kt.readInt=function(t,e,i){for(var s=this.options.ecmaVersion>=12&&void 0===e,r=i&&48===this.input.charCodeAt(this.pos),a=this.pos,n=0,o=0,h=0,p=null==e?1/0:e;h<p;++h,++this.pos){var c=this.input.charCodeAt(this.pos),u=void 0;if(s&&95===c)r&&this.raiseRecoverable(this.pos,"Numeric separator is not allowed in legacy octal numeric literals"),95===o&&this.raiseRecoverable(this.pos,"Numeric separator must be exactly one underscore"),0===h&&this.raiseRecoverable(this.pos,"Numeric separator is not allowed at the first of digits"),o=c;else{if((u=c>=97?c-97+10:c>=65?c-65+10:c>=48&&c<=57?c-48:1/0)>=t)break;o=c,n=n*t+u}}return s&&95===o&&this.raiseRecoverable(this.pos-1,"Numeric separator is not allowed at the last of digits"),this.pos===a||null!=e&&this.pos-a!==e?null:n},Kt.readRadixNumber=function(t){var e=this.pos;this.pos+=2;var i=this.readInt(t);return null==i&&this.raise(this.start+2,"Expected number in radix "+t),this.options.ecmaVersion>=11&&110===this.input.charCodeAt(this.pos)?(i=Qt(this.input.slice(e,this.pos)),++this.pos):u(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number"),this.finishToken(y.num,i)},Kt.readNumber=function(t){var e=this.pos;t||null!==this.readInt(10,void 0,!0)||this.raise(e,"Invalid number");var i=this.pos-e>=2&&48===this.input.charCodeAt(e);i&&this.strict&&this.raise(e,"Invalid number");var s=this.input.charCodeAt(this.pos);if(!i&&!t&&this.options.ecmaVersion>=11&&110===s){var r=Qt(this.input.slice(e,this.pos));return++this.pos,u(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number"),this.finishToken(y.num,r)}i&&/[89]/.test(this.input.slice(e,this.pos))&&(i=!1),46!==s||i||(++this.pos,this.readInt(10),s=this.input.charCodeAt(this.pos)),69!==s&&101!==s||i||(43!==(s=this.input.charCodeAt(++this.pos))&&45!==s||++this.pos,null===this.readInt(10)&&this.raise(e,"Invalid number")),u(this.fullCharCodeAtPos())&&this.raise(this.pos,"Identifier directly after number");var a,n=(a=this.input.slice(e,this.pos),i?parseInt(a,8):parseFloat(a.replace(/_/g,"")));return this.finishToken(y.num,n)},Kt.readCodePoint=function(){var t;if(123===this.input.charCodeAt(this.pos)){this.options.ecmaVersion<6&&this.unexpected();var e=++this.pos;t=this.readHexChar(this.input.indexOf("}",this.pos)-this.pos),++this.pos,t>1114111&&this.invalidStringToken(e,"Code point out of bounds")}else t=this.readHexChar(4);return t},Kt.readString=function(t){for(var e="",i=++this.pos;;){this.pos>=this.input.length&&this.raise(this.start,"Unterminated string constant");var s=this.input.charCodeAt(this.pos);if(s===t)break;92===s?(e+=this.input.slice(i,this.pos),e+=this.readEscapedChar(!1),i=this.pos):8232===s||8233===s?(this.options.ecmaVersion<10&&this.raise(this.start,"Unterminated string constant"),++this.pos,this.options.locations&&(this.curLine++,this.lineStart=this.pos)):(_(s)&&this.raise(this.start,"Unterminated string constant"),++this.pos)}return e+=this.input.slice(i,this.pos++),this.finishToken(y.string,e)};var Yt={};Kt.tryReadTemplateToken=function(){this.inTemplateElement=!0;try{this.readTmplToken()}catch(t){if(t!==Yt)throw t;this.readInvalidTemplateToken()}this.inTemplateElement=!1},Kt.invalidStringToken=function(t,e){if(this.inTemplateElement&&this.options.ecmaVersion>=9)throw Yt;this.raise(t,e)},Kt.readTmplToken=function(){for(var t="",e=this.pos;;){this.pos>=this.input.length&&this.raise(this.start,"Unterminated template");var i=this.input.charCodeAt(this.pos);if(96===i||36===i&&123===this.input.charCodeAt(this.pos+1))return this.pos!==this.start||this.type!==y.template&&this.type!==y.invalidTemplate?(t+=this.input.slice(e,this.pos),this.finishToken(y.template,t)):36===i?(this.pos+=2,this.finishToken(y.dollarBraceL)):(++this.pos,this.finishToken(y.backQuote));if(92===i)t+=this.input.slice(e,this.pos),t+=this.readEscapedChar(!0),e=this.pos;else if(_(i)){switch(t+=this.input.slice(e,this.pos),++this.pos,i){case 13:10===this.input.charCodeAt(this.pos)&&++this.pos;case 10:t+="\n";break;default:t+=String.fromCharCode(i)}this.options.locations&&(++this.curLine,this.lineStart=this.pos),e=this.pos}else++this.pos}},Kt.readInvalidTemplateToken=function(){for(;this.pos<this.input.length;this.pos++)switch(this.input[this.pos]){case"\\":++this.pos;break;case"$":if("{"!==this.input[this.pos+1])break;case"`":return this.finishToken(y.invalidTemplate,this.input.slice(this.start,this.pos));case"\r":"\n"===this.input[this.pos+1]&&++this.pos;case"\n":case"\u2028":case"\u2029":++this.curLine,this.lineStart=this.pos+1}this.raise(this.start,"Unterminated template")},Kt.readEscapedChar=function(t){var e=this.input.charCodeAt(++this.pos);switch(++this.pos,e){case 110:return"\n";case 114:return"\r";case 120:return String.fromCharCode(this.readHexChar(2));case 117:return L(this.readCodePoint());case 116:return"\t";case 98:return"\b";case 118:return"\v";case 102:return"\f";case 13:10===this.input.charCodeAt(this.pos)&&++this.pos;case 10:return this.options.locations&&(this.lineStart=this.pos,++this.curLine),"";case 56:case 57:if(this.strict&&this.invalidStringToken(this.pos-1,"Invalid escape sequence"),t){var i=this.pos-1;this.invalidStringToken(i,"Invalid escape sequence in template string")}default:if(e>=48&&e<=55){var s=this.input.substr(this.pos-1,3).match(/^[0-7]+/)[0],r=parseInt(s,8);return r>255&&(s=s.slice(0,-1),r=parseInt(s,8)),this.pos+=s.length-1,e=this.input.charCodeAt(this.pos),"0"===s&&56!==e&&57!==e||!this.strict&&!t||this.invalidStringToken(this.pos-1-s.length,t?"Octal literal in template string":"Octal literal in strict mode"),String.fromCharCode(r)}return _(e)?(this.options.locations&&(this.lineStart=this.pos,++this.curLine),""):String.fromCharCode(e)}},Kt.readHexChar=function(t){var e=this.pos,i=this.readInt(16,t);return null===i&&this.invalidStringToken(e,"Bad character escape sequence"),i},Kt.readWord1=function(){this.containsEsc=!1;for(var t="",e=!0,i=this.pos,s=this.options.ecmaVersion>=6;this.pos<this.input.length;){var r=this.fullCharCodeAtPos();if(l(r,s))this.pos+=r<=65535?1:2;else{if(92!==r)break;this.containsEsc=!0,t+=this.input.slice(i,this.pos);var a=this.pos;117!==this.input.charCodeAt(++this.pos)&&this.invalidStringToken(this.pos,"Expecting Unicode escape sequence \\uXXXX"),++this.pos;var n=this.readCodePoint();(e?u:l)(n,s)||this.invalidStringToken(a,"Invalid Unicode escape"),t+=L(n),i=this.pos}e=!1}return t+this.input.slice(i,this.pos)},Kt.readWord=function(){var t=this.readWord1(),e=y.name;return this.keywords.test(t)&&(e=x[t]),this.finishToken(e,t)};var Xt="8.19.0";H.acorn={Parser:H,version:Xt,defaultOptions:M,Position:D,SourceLocation:O,getLineInfo:B,Node:mt,TokenType:d,tokTypes:y,keywordTypes:x,TokContext:at,tokContexts:nt,isIdentifierChar:l,isIdentifierStart:u,Token:zt,isNewLine:_,lineBreak:b,lineBreakG:k,nonASCIIwhitespace:C},t.Node=mt,t.Parser=H,t.Position=D,t.SourceLocation=O,t.TokContext=at,t.Token=zt,t.TokenType=d,t.defaultOptions=M,t.getLineInfo=B,t.isIdentifierChar=l,t.isIdentifierStart=u,t.isNewLine=_,t.keywordTypes=x,t.lineBreak=b,t.lineBreakG=k,t.nonASCIIwhitespace=C,t.parse=function(t,e){return H.parse(t,e)},t.parseExpressionAt=function(t,e,i){return H.parseExpressionAt(t,e,i)},t.tokContexts=nt,t.tokTypes=y,t.tokenizer=function(t,e){return H.tokenizer(t,e)},t.version=Xt};
  const makeAcorn = () => { const e = {}; ACORN_FACTORY(e); return e; };

  /* ================================================================== *
   *  FastswCore — URL / HTML / CSS / JS rewriting.
   *  MUST stay self-contained: it is stringified and shipped to the page.
   * ================================================================== */
  function FastswCore(cfg, acorn) {
    const P = cfg.prefix;
    const ORIGIN = self.location.origin;

    const isProxied = (u) => u.startsWith(P) || u.startsWith(ORIGIN + P);
    const encode = (u) => {
      const i = u.indexOf("#");
      return P + encodeURIComponent(i < 0 ? u : u.slice(0, i)) + (i < 0 ? "" : u.slice(i));
    };
    const decode = (path) => {
      try { return decodeURIComponent(path.slice(P.length)); } catch (e) { return "about:blank"; }
    };
    const SKIP = /^(?:data:|blob:|about:|mailto:|tel:|sms:|#|javascript:)/i;
    // FastSW's own files (runtime, libcurl, acorn) live on the proxy origin and must never be proxied
    const RESERVED = new Set([cfg.clientPath, cfg.libcurlJS].filter(Boolean));
    const isReserved = (u) => RESERVED.has(u.startsWith(ORIGIN) ? u.slice(ORIGIN.length) : u);

    const rewriteURL = (u, base) => {
      if (u == null) return u;
      u = String(u).trim();
      if (!u || SKIP.test(u) || isProxied(u) || isReserved(u)) return u;
      try {
        const a = new URL(u, base);
        if (a.protocol !== "http:" && a.protocol !== "https:") return u;
        return encode(a.href);
      } catch (e) { return u; }
    };
    const unrewrite = (u) => {
      if (typeof u !== "string" || !isProxied(u)) return u;
      try { const x = new URL(u, ORIGIN); return decode(x.pathname) + x.hash; } catch (e) { return u; }
    };

    /* ---------------------------- CSS ---------------------------- */
    const rewriteCSS = (css, base) =>
      String(css)
        .replace(/url\(\s*(["']?)([^)"']*?)\1\s*\)/gi, (m, q, u) => `url(${q}${rewriteURL(u, base)}${q})`)
        .replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, u) => `@import ${q}${rewriteURL(u, base)}${q}`);

    const rewriteSrcset = (s, base) => {
      if (/^\s*data:/i.test(s)) return s;
      return s.replace(/(^|,)\s*([^\s,]+)(\s+[^,]*)?/g, (m, a, u, d) => `${a} ${rewriteURL(u, base)}${d || ""}`);
    };

    /* ---------------------------- JS ----------------------------- */
    const RE_START = /[(,=:\[!&|?{};]$/;
    const KW_BEFORE_REGEX = /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)\s*$/;
    const IMPORT_STR = /(?:^|[^\w$.])(?:from|import)\s*$/;
    const PROP_RE = /(?<!\.)(\?\.|\.)(\s*)(location|top|parent)(?![\w$])/g;
    const EVAL_RE = /(?<![\w$.])eval\s*\(/g;
    const DYN_IMPORT_RE = /(?<![\w$.])import\s*\(/g;

    /* ---- AST rewriter (acorn): exact, scope-aware, position-based patching ---- */
    const ID_NAMES = new Set(["location", "top", "parent", "eval", "Function"]);
    const PROP_NAMES = new Set(["location", "top", "parent"]);
    const FNT = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
    const SKIPK = new Set(["type", "start", "end", "loc", "range"]);

    function patNames(p, out) {
      if (!p) return;
      switch (p.type) {
        case "Identifier": out.add(p.name); break;
        case "ObjectPattern": p.properties.forEach((x) => patNames(x.type === "RestElement" ? x.argument : x.value, out)); break;
        case "ArrayPattern": p.elements.forEach((e) => patNames(e, out)); break;
        case "RestElement": patNames(p.argument, out); break;
        case "AssignmentPattern": patNames(p.left, out); break;
      }
    }
    function varNames(node, out) {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "VariableDeclaration" && node.kind === "var") node.declarations.forEach((d) => patNames(d.id, out));
      if (FNT.has(node.type) || node.type === "ClassBody") return;
      for (const k in node) {
        if (SKIPK.has(k)) continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && varNames(c, out));
        else if (v && typeof v.type === "string") varNames(v, out);
      }
    }
    function lexNames(stmts, out) {
      for (let s of stmts) {
        if (!s) continue;
        if ((s.type === "ExportNamedDeclaration" || s.type === "ExportDefaultDeclaration") && s.declaration) s = s.declaration;
        if (s.type === "VariableDeclaration" && s.kind !== "var") s.declarations.forEach((d) => patNames(d.id, out));
        else if ((s.type === "FunctionDeclaration" || s.type === "ClassDeclaration") && s.id) out.add(s.id.name);
        else if (s.type === "ImportDeclaration") s.specifiers.forEach((x) => out.add(x.local.name));
      }
    }

    function parseJS(src) {
      const A = acorn;                                            // embedded parser, passed in (no global)
      if (!A) return null;
      for (const sourceType of ["script", "module"]) {
        try {
          return A.parse(src, { ecmaVersion: "latest", sourceType, allowHashBang: true, allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true, allowImportExportEverywhere: true });
        } catch (e) {}
      }
      return null;
    }

    // Never let a rewriter failure (e.g. stack overflow on a deeply nested obfuscated bundle) turn a script into an error page:
    // AST rewrite -> legacy scanner -> untouched source.
    function rewriteJS(src, base) {
      if (!src) return src;
      src = String(src);
      try { return rewriteJSAst(src, base); } catch (e) {}
      try { return rewriteJSLegacy(src, base); } catch (e) {}
      return src;
    }

    // Reverse our own rewrites so page code that inspects its own source (fn.toString(), <script>.textContent,
    // integrity checks in obfuscated bundles) sees the ORIGINAL text.
    function unrewriteJS(s) {
      s = String(s);
      if (s.indexOf("fastsw") < 0) return s;
      return s
        .replace(/\bfastsw\$(location|top|parent)\b/g, "$1")
        .replace(/\b(location|top|parent|eval|Function): fastsw\.\1\b/g, "$1")
        .replace(/\b(location|top|parent): \1\b/g, "$1")
        .replace(/\bfastsw\.(location|top|parent|eval|Function)\b/g, "$1")
        .replace(/\bfastsw\.import\("(?:[^"\\]|\\.)*",/g, "import(")
        .replace(/\bfastsw\.meta\((import\.meta)\)/g, "$1");
    }

    function rewriteJSAst(src, base) {
      const ast = parseJS(src);
      if (!ast) return rewriteJSLegacy(src, base);               // no parser / unparsable -> scanner fallback
      const edits = [];
      const edit = (s, e, t) => edits.push([s, e, t]);
      const baseJSON = JSON.stringify(base);
      const scopes = [];
      const shadowed = (n) => scopes.some((s) => s.has(n));
      const kids = (node, fn) => {
        for (const k in node) {
          if (SKIPK.has(k)) continue;
          const v = node[k];
          if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && fn(c, k));
          else if (v && typeof v.type === "string") fn(v, k);
        }
      };
      const withScope = (set, fn) => { scopes.push(set); fn(); scopes.pop(); };

      // patterns (declaration targets / destructuring): only expression parts + special keys are visited
      function pat(p) {
        if (!p) return;
        switch (p.type) {
          case "ObjectPattern":
            for (const x of p.properties) {
              if (x.type === "RestElement") { pat(x.argument); continue; }
              if (x.computed) walk(x.key, x, "key");
              else {
                const nm = x.key.type === "Identifier" ? x.key.name : x.key.type === "Literal" ? x.key.value : null;
                if (PROP_NAMES.has(nm)) edit(x.key.start, x.key.end, x.shorthand ? "fastsw$" + nm + ": " + nm : "fastsw$" + nm);
              }
              pat(x.value);
            }
            break;
          case "ArrayPattern": p.elements.forEach(pat); break;
          case "RestElement": pat(p.argument); break;
          case "AssignmentPattern": pat(p.left); walk(p.right, p, "right"); break;
          case "Identifier": break;
          default: walk(p, null, "");                              // MemberExpression targets etc.
        }
      }

      function walk(node, parent, key) {
        if (!node) return;
        switch (node.type) {
          case "Program": {
            const set = new Set(); varNames(node, set); lexNames(node.body, set);
            return withScope(set, () => node.body.forEach((c) => walk(c, node, "body")));
          }
          case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": {
            const set = new Set();
            node.params.forEach((p) => patNames(p, set));
            if (node.type === "FunctionExpression" && node.id) set.add(node.id.name);
            if (node.type !== "ArrowFunctionExpression") set.add("arguments");
            if (node.body.type === "BlockStatement") { varNames(node.body, set); lexNames(node.body.body, set); }
            return withScope(set, () => {
              node.params.forEach(pat);
              if (node.body.type === "BlockStatement") node.body.body.forEach((c) => walk(c, node.body, "body"));
              else walk(node.body, node, "body");
            });
          }
          case "BlockStatement": case "StaticBlock": {
            const set = new Set(); lexNames(node.body, set);
            return withScope(set, () => node.body.forEach((c) => walk(c, node, "body")));
          }
          case "SwitchStatement": {
            walk(node.discriminant, node, "discriminant");
            const set = new Set(); node.cases.forEach((c) => lexNames(c.consequent, set));
            return withScope(set, () => node.cases.forEach((c) => { walk(c.test, c, "test"); c.consequent.forEach((s) => walk(s, c, "consequent")); }));
          }
          case "ForStatement": case "ForInStatement": case "ForOfStatement": {
            const set = new Set(); const init = node.init || node.left;
            if (init && init.type === "VariableDeclaration") lexNames([init], set);
            return withScope(set, () => {
              if (node.type === "ForStatement") { walk(node.init, node, "init"); walk(node.test, node, "test"); walk(node.update, node, "update"); }
              else {
                if (node.left.type === "VariableDeclaration" || node.left.type === "Identifier" || node.left.type === "MemberExpression") walk(node.left, node, "left"); else pat(node.left);
                walk(node.right, node, "right");
              }
              walk(node.body, node, "body");
            });
          }
          case "CatchClause": {
            const set = new Set(); patNames(node.param, set);
            return withScope(set, () => { pat(node.param); walk(node.body, node, "body"); });
          }
          case "VariableDeclarator": pat(node.id); return walk(node.init, node, "init");
          case "AssignmentExpression":
            if (node.left.type === "ObjectPattern" || node.left.type === "ArrayPattern") pat(node.left); else walk(node.left, node, "left");
            return walk(node.right, node, "right");
          case "ClassExpression": case "ClassDeclaration": {
            const set = new Set(); if (node.id) set.add(node.id.name);
            return withScope(set, () => { walk(node.superClass, node, "superClass"); walk(node.body, node, "body"); });
          }
          case "MethodDefinition": case "PropertyDefinition": case "Property":
            if (node.computed) walk(node.key, node, "key");
            if (node.type === "Property" && node.shorthand && node.value.type === "Identifier") {
              const nm = node.value.name;
              if (ID_NAMES.has(nm) && !shadowed(nm)) edit(node.start, node.end, nm + ": fastsw." + nm);
              return;
            }
            return walk(node.value, node, "value");
          case "LabeledStatement": return walk(node.body, node, "body");
          case "BreakStatement": case "ContinueStatement": return;
          case "ImportDeclaration": return edit(node.source.start, node.source.end, JSON.stringify(rewriteURL(node.source.value, base)));
          case "ExportAllDeclaration": return node.source && edit(node.source.start, node.source.end, JSON.stringify(rewriteURL(node.source.value, base)));
          case "ExportNamedDeclaration":
            if (node.source) edit(node.source.start, node.source.end, JSON.stringify(rewriteURL(node.source.value, base)));
            return node.declaration && walk(node.declaration, node, "declaration");
          case "ImportExpression":
            edit(node.start, node.source.start, `fastsw.import(${baseJSON},`);
            walk(node.source, node, "source"); if (node.options) walk(node.options, node, "options");
            return;
          case "MetaProperty":
            if (node.meta.name === "import") edit(node.start, node.end, "fastsw.meta(import.meta)");
            return;
          case "MemberExpression":
            walk(node.object, node, "object");
            if (!node.computed) {
              if (PROP_NAMES.has(node.property.name)) edit(node.property.start, node.property.end, "fastsw$" + node.property.name);
            } else if (node.property.type === "Literal" && typeof node.property.value === "string" && PROP_NAMES.has(node.property.value))
              edit(node.property.start, node.property.end, JSON.stringify("fastsw$" + node.property.value));
            else walk(node.property, node, "property");
            return;
          case "Identifier":
            if (ID_NAMES.has(node.name) && !shadowed(node.name)) edit(node.start, node.end, "fastsw." + node.name);
            return;
        }
        kids(node, (c, k) => walk(c, node, k));
      }

      walk(ast, null, "");
      if (!edits.length) return src;
      edits.sort((a, b) => b[0] - a[0]);
      let out = src;
      for (const [s, e, t] of edits) out = out.slice(0, s) + t + out.slice(e);
      return out;
    }

    /* ---- legacy scanner (only used when acorn is missing or the source can't be parsed) ---- */
    function rewriteJSLegacy(src, base) {
      if (!src) return src;
      const s = String(src), n = s.length;

      // If the script itself declares location/top/parent as a binding, leave that bare name alone.
      const declared = new Set();
      for (const name of ["location", "top", "parent"]) {
        const r = new RegExp(String.raw`\b(?:var|let|const)\s+(?:[^;=(]*,\s*)?${name}\b|function\s*[\w$]*\s*\([^)]*\b${name}\b|\b${name}\s*=>|\([^()]*\b${name}\b[^()]*\)\s*=>|catch\s*\(\s*${name}\b|\{[^{}]*\b${name}\b[^{}]*\}\s*=(?!=)|(?:function|class)\s+${name}\b`);
        if (r.test(s)) declared.add(name);
      }
      const bare = ["location", "top", "parent"].filter((x) => !declared.has(x));
      const bareRe = bare.length
        ? new RegExp(`(?<![\\w$.])(?:${bare.join("|")})(?![\\w$])(?!\\s*[:(])`, "g")
        : null;
      const baseJSON = JSON.stringify(base);

      const rewriteCode = (c) => {
        c = c.replace(PROP_RE, (m, dot, ws, name) => dot + ws + "fastsw$" + name);
        if (bareRe) {
          c = c.replace(bareRe, (m, off, str) => {
            const before = str.slice(0, off).trimEnd().slice(-1);
            const after = str.slice(off + m.length).trimStart()[0];
            if ((before === "{" || before === ",") && (after === "," || after === "}")) return m; // shorthand {top}
            return "fastsw." + m;
          });
        }
        return c.replace(EVAL_RE, "fastsw.eval(").replace(DYN_IMPORT_RE, `fastsw.import(${baseJSON},`);
      };

      let i = 0, out = "", code = "";
      const flush = () => { if (code) { out += rewriteCode(code); code = ""; } };
      const special = /["'`\/{}]/g;

      function run(inTpl) {
        let depth = 0;
        while (i < n) {
          special.lastIndex = i;
          const m = special.exec(s);
          if (!m) { code += s.slice(i); i = n; return; }
          code += s.slice(i, m.index); i = m.index;
          const c = s[i], d = s[i + 1];

          if (c === "/") {
            if (d === "/") { flush(); let j = s.indexOf("\n", i); if (j < 0) j = n; out += s.slice(i, j); i = j; continue; }
            if (d === "*") { flush(); let j = s.indexOf("*/", i + 2); j = j < 0 ? n : j + 2; out += s.slice(i, j); i = j; continue; }
            let t = code.slice(-40).trimEnd(); if (!t) t = out.slice(-40).trimEnd();
            if (!t || RE_START.test(t) || KW_BEFORE_REGEX.test(t)) {          // regex literal
              let j = i + 1, cls = false;
              while (j < n) {
                const ch = s[j];
                if (ch === "\n") { j = -1; break; }
                if (ch === "\\") { j += 2; continue; }
                if (ch === "[") cls = true; else if (ch === "]") cls = false;
                else if (ch === "/" && !cls) break;
                j++;
              }
              if (j > 0 && j < n) {
                j++; while (j < n && /[a-z]/i.test(s[j])) j++;
                flush(); out += s.slice(i, j); i = j; continue;
              }
            }
            code += "/"; i++; continue;                                          // division
          }

          if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < n && s[j] !== c && s[j] !== "\n") { if (s[j] === "\\") j++; j++; }
            j++;
            const str = s.slice(i, j);
            const imp = IMPORT_STR.test(code.slice(-30));
            flush();
            out += imp ? c + rewriteURL(str.slice(1, -1), base) + c : str;
            i = j; continue;
          }

          if (c === "`") {
            flush(); out += "`"; i++;
            while (i < n) {
              const ch = s[i];
              if (ch === "\\") { out += s.slice(i, i + 2); i += 2; }
              else if (ch === "`") { out += "`"; i++; break; }
              else if (ch === "$" && s[i + 1] === "{") { out += "${"; i += 2; run(true); }
              else { let j = i + 1; while (j < n && s[j] !== "\\" && s[j] !== "`" && s[j] !== "$") j++; out += s.slice(i, j); i = j; }
            }
            continue;
          }

          if (c === "{") { depth++; code += c; i++; continue; }
          if (c === "}") {
            if (inTpl && depth === 0) { flush(); out += "}"; i++; return; }
            depth--; code += c; i++; continue;
          }
        }
      }
      run(false); flush();
      return out;
    }

    /* --------------------------- HTML ---------------------------- */
    const ENT = { "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    const unent = (s) => s.replace(/&(?:amp|quot|#39|apos|lt|gt);/g, (m) => ENT[m]);
    const ent = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const URL_ATTRS = new Set(["href", "src", "action", "poster", "data", "formaction", "background", "manifest", "ping", "cite", "longdesc", "codebase", "icon", "xlink:href"]);
    const ATTR_RE = /([^\s"'<>\/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    const HTML_RE = /<!--[\s\S]*?-->|<(script|style)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][^\s\/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;

    function rewriteAttrs(tag, attrs, base) {
      return attrs.replace(ATTR_RE, (m, name, eq, dq, sq, uq) => {
        let v = dq !== undefined ? dq : sq !== undefined ? sq : uq;
        if (v === undefined) return m;
        const ln = name.toLowerCase();
        if (ln === "integrity") return "";            // (nonce is kept: page scripts read script.nonce to build their own scripts; CSP is stripped anyway)
        if (URL_ATTRS.has(ln)) {
          v = unent(v);
          v = /^\s*javascript:/i.test(v) ? "javascript:" + rewriteJS(v.replace(/^\s*javascript:/i, ""), base) : rewriteURL(v, base);
        } else if (ln === "srcset" || ln === "imagesrcset") v = rewriteSrcset(unent(v), base);
        else if (ln === "style") v = rewriteCSS(unent(v), base);
        else if (/^on[a-z]+$/.test(ln)) v = rewriteJS(unent(v), base);
        else if (ln === "srcdoc") v = rewriteHTML(unent(v), base, true, {});
        else return m;
        return `${name}="${ent(v)}"`;
      });
    }

    function rewriteImportMap(body, base) {
      try {
        const j = JSON.parse(body);
        const f = (o) => { for (const k in o) o[k] = rewriteURL(o[k], base); };
        if (j.imports) f(j.imports);
        for (const sc in j.scopes || {}) f(j.scopes[sc]);
        return JSON.stringify(j);
      } catch (e) { return body; }
    }

    function rewriteHTML(html, base, inject, boot) {
      const bm = /<base\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html);
      if (bm) { try { base = new URL(unent(bm[1] !== undefined ? bm[1] : bm[2] !== undefined ? bm[2] : bm[3]), base).href; } catch (e) {} }

      html = html.replace(HTML_RE, (m, sTag, sAttrs, sBody, tag, attrs) => {
        if (m.startsWith("<!--")) return m;
        if (sTag) {
          const st = sTag.toLowerCase();
          const a = rewriteAttrs(st, sAttrs, base);
          let body = sBody;
          if (st === "style") body = rewriteCSS(body, base);
          else {
            const type = ((/(?:^|\s)type\s*=\s*["']?([^"'\s>]+)/i.exec(sAttrs) || [])[1] || "").toLowerCase();
            if (!type || /^(module|(text|application)\/(javascript|ecmascript)|jsx?)$/.test(type)) {
              if (!/(?:^|\s)src\s*=/i.test(sAttrs)) body = rewriteJS(body, base);
            } else if (type === "importmap") body = rewriteImportMap(body, base);
          }
          return `<${sTag}${a}>${body}</${sTag}>`;
        }
        const t = tag.toLowerCase();
        if (t === "base") return "";
        if (t === "meta") {
          if (/http-equiv\s*=\s*["']?\s*(content-security-policy|x-frame-options)/i.test(attrs)) return "";
          if (/http-equiv\s*=\s*["']?\s*refresh/i.test(attrs))
            attrs = attrs.replace(/(content\s*=\s*["'][^"']*?url\s*=\s*)([^"';]+)/i, (a, p, u) => p + rewriteURL(unent(u.trim()), base));
          return `<${tag}${attrs}>`;
        }
        return `<${tag}${rewriteAttrs(t, attrs, base)}>`;
      });

      if (inject) {
        const bootJSON = JSON.stringify(boot || {}).replace(/</g, "\\u003c");
        const head =
          `<script>self.__fastswBoot=${bootJSON}</script>` +
          (cfg.pageWebSocket ? `<script src="${cfg.libcurlJS}"></script>` : "") +
          `<script src="${cfg.clientPath}"></script>`;
        const dm = /<!doctype[^>]*>/i.exec(html);
        html = dm ? html.slice(0, dm.index + dm[0].length) + head + html.slice(dm.index + dm[0].length) : head + html;
      }
      return html;
    }

    return { encode, decode, rewriteURL, unrewrite, rewriteCSS, rewriteJS, unrewriteJS, rewriteHTML, rewriteSrcset };
  }

  /* ================================================================== *
   *  fastswRuntime — runs inside every proxied page / worker.
   *  Also self-contained (stringified by the service worker).
   * ================================================================== */
  function fastswRuntime(Core, cfg, acorn) {
    "use strict";
    const G = self;
    if (G.fastsw) return;
    const core = Core(cfg, acorn);
    const nativeToString = Function.prototype.toString;      // captured before we override it (used to serialise our own code)
    // libcurl.js declares `const libcurl` at script top level: a global lexical binding, NOT window.libcurl
    const LC = (() => { try { return typeof libcurl !== "undefined" ? libcurl : G.libcurl; } catch (e) { return G.libcurl; } })();
    const isWin = typeof document !== "undefined";
    const realLoc = G.location;
    const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
    const cur = () => {
      if (realLoc.protocol === "about:") {                       // about:blank / about:srcdoc frames inherit the parent's page
        try { if (G.parent !== G && G.parent.fastsw) return new URL(G.parent.fastsw.location.href); } catch (e) {}
        return new URL("about:blank");
      }
      try { return new URL(core.decode(realLoc.pathname)); } catch (e) { return new URL("about:blank"); }
    };
    const base = () => cur().href;
    const R = (u) => core.rewriteURL(u, base());
    const lurl = () => { const u = cur(); u.hash = realLoc.hash; return u; };
    const boot = G.__fastswBoot || {};
    const swc = safe(() => G.navigator.serviceWorker);
    // cookie writes are acknowledged by the SW, and page-initiated navigations (location.replace / assign / href)
    // wait for those acks: Google's challenge does `document.cookie = "SG_SS=…"; location.replace(…)` back to back,
    // and the navigation request must already find the cookie in the SW's jar.
    const acks = new Set();
    const post = (m) => {
      try {
        if (!(swc && swc.controller)) return;
        const ch = new MessageChannel();
        const p = new Promise((res) => { ch.port1.onmessage = () => res(); setTimeout(res, 400); });
        acks.add(p); p.then(() => acks.delete(p));
        swc.controller.postMessage(m, [ch.port2]);
      } catch (e) {}
    };
    const afterCookies = (fn) => (acks.size ? Promise.all([...acks]).then(fn, fn) : fn());

    /* ---------- fake Location (fastsw.location) ---------- */
    const L = {};
    for (const p of ["href", "origin", "protocol", "host", "hostname", "port", "pathname", "search", "hash"]) {
      Object.defineProperty(L, p, {
        enumerable: true,
        get: () => lurl()[p],
        set: (v) => {
          if (p === "hash") { realLoc.hash = v; return; }
          if (p === "href") { const t = R(v); afterCookies(() => { realLoc.href = t; }); return; }
          if (p === "origin") return;
          const u = lurl(); u[p] = v; const t = core.encode(u.href); afterCookies(() => { realLoc.href = t; });
        },
      });
    }
    L.assign = (v) => { const t = R(v); afterCookies(() => realLoc.assign(t)); };
    L.replace = (v) => { const t = R(v); afterCookies(() => realLoc.replace(t)); };
    L.reload = () => { afterCookies(() => realLoc.reload()); };
    L.toString = () => lurl().href;
    L.valueOf = () => lurl().href;
    L.ancestorOrigins = [];
    L[Symbol.toPrimitive] = () => lurl().href;

    /* ---------- fastsw object: dummy top / parent / location so pages can't bust out ---------- */
    const isFast = (w) => safe(() => !!w.fastsw, false);

    // eval: handles strings AND TrustedScript objects. Google's challenge (the SG_REL page) does
    //   (0, eval)(trustedTypesPolicy.createScript(code))
    // so a version that only accepted `typeof x === "string"` returned the TrustedScript untouched and the
    // challenge silently never ran. window.eval itself is wrapped too, so `window.eval(...)` / `self.eval(...)`
    // / `E.eval(...)` (member calls the rewriter can't see) get rewritten as well. Indirect (global) eval semantics.
    const nativeEval = G.eval;
    const isTrusted = (x) => safe(() => !!(G.TrustedScript && x instanceof G.TrustedScript), false);
    const evalFn = {                                                  // method shorthand: `function eval(){}` is illegal in strict mode
      eval(x) {
        if (typeof x === "string" || isTrusted(x)) x = core.rewriteJS(String(x), base());
        return nativeEval.call(G, x);
      },
    }.eval;
    safe(() => Object.defineProperty(G, "eval", { value: evalFn, writable: true, configurable: true, enumerable: false }));
    for (const n of ["setTimeout", "setInterval"]) {                 // string handlers are code too
      const o = G[n]; if (typeof o !== "function") continue;
      G[n] = function (h, ...r) { if (typeof h === "string") h = core.rewriteJS(h, base()); return o.call(this === undefined || this === null ? G : this, h, ...r); };
    }

    const fastsw = {
      get location() { return L; },
      set location(v) { L.href = v; },            // bare `location = "..."` in page scripts must navigate, not clobber the dummy
      get top() { let w = G; safe(() => { while (w.parent !== w && isFast(w.parent)) w = w.parent; }); return w; },
      get parent() { return safe(() => (G.parent !== G && isFast(G.parent) ? G.parent : G), G); },
      get self() { return G; },
      eval: evalFn,
      import: (b, spec, opts) => (opts === undefined ? import(core.rewriteURL(String(spec), b)) : import(core.rewriteURL(String(spec), b), opts)),
      meta: (m) => Object.assign({}, m, { url: core.unrewrite(m.url) }),
      Function: new Proxy(Function, {
        construct(t, a, nt) { if (a.length) a[a.length - 1] = core.rewriteJS(String(a[a.length - 1]), base()); return Reflect.construct(t, a, nt === undefined ? t : nt); },
        apply(t, th, a) { if (a.length) a[a.length - 1] = core.rewriteJS(String(a[a.length - 1]), base()); return Reflect.apply(t, th, a); },
      }),
      rewriteURL: R, unrewrite: core.unrewrite, core,
    };
    Object.defineProperty(G, "fastsw", { value: fastsw });

    // give about:blank frames / popups the runtime too, otherwise a page could escape through them
    const inject = (w) => {
      try {
        if (!w || w === G || w.fastsw || w.location.protocol !== "about:") return;
        if (LC) w.libcurl = LC;
        // evaluate the runtime inside the child realm, handing it our already-built parser object
        w.eval("(" + nativeToString.call(fastswRuntime) + ")")(w.eval("(" + nativeToString.call(Core) + ")"), w.JSON.parse(JSON.stringify(cfg)), acorn);
      } catch (e) {}
    };

    /* ---------- fastsw$location / fastsw$top / fastsw$parent — the JS rewriter turns
       `x.location` into `x.fastsw$location`; for real windows/documents these return the dummies ---------- */
    const isWinLike = (o) => safe(() => o && o.window === o, false);
    const isDocLike = (o) => isWin && o instanceof Document;
    const fastOf = (o) => (isWinLike(o) ? safe(() => o.fastsw) : isDocLike(o) ? safe(() => o.defaultView && o.defaultView.fastsw) : undefined);
    const def = (name, get, set) => Object.defineProperty(Object.prototype, "fastsw$" + name, { get, set, configurable: true, enumerable: false });
    def("location",
      function () { const f = fastOf(this); return f ? f.location : this.location; },
      function (v) { const f = fastOf(this); if (f) f.location.href = v; else this.location = v; });
    def("top",
      function () { const f = isWinLike(this) && fastOf(this); return f ? f.top : this.top; },
      function (v) { this.top = v; });
    def("parent",
      function () { const f = isWinLike(this) && fastOf(this); return f ? f.parent : this.parent; },
      function (v) { this.parent = v; });

    /* ---------- network ---------- */
    if (G.fetch) {
      const of = G.fetch;
      G.fetch = function (i, init) {
        try {
          if (typeof Request !== "undefined" && i instanceof Request) i = new Request(R(i.url), i);
          else i = R(i && i.href !== undefined ? i.href : i);
        } catch (e) {}
        return of.call(this, i, init);
      };
    }
    if (G.XMLHttpRequest) {
      const o = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, u, ...r) { return o.call(this, m, R(u), ...r); };
    }
    if (G.navigator && G.navigator.sendBeacon) {
      const ob = G.navigator.sendBeacon;
      Navigator.prototype.sendBeacon = function (u, d) { return ob.call(this, R(u), d); };
    }
    const ctor = (name, worker) => {
      const O = G[name]; if (!O) return;
      G[name] = new Proxy(O, {
        construct(t, a, nt) {
          if ((a[0] != null && typeof a[0] !== "object") || a[0] instanceof URL) {
            let u = R(String(a[0]));
            if (worker && a[1] && a[1].type === "module" && u.startsWith(cfg.prefix)) u += (u.includes("?") ? "&" : "?") + "fastsw_module=1";
            a[0] = u;
          }
          return Reflect.construct(t, a, nt === undefined ? t : nt);
        },
      });
    };
    ["Worker", "SharedWorker"].forEach((n) => ctor(n, true));
    ["EventSource", "Request", "Audio"].forEach((n) => ctor(n, false));
    if (!isWin && G.importScripts) { const oi = G.importScripts; G.importScripts = (...a) => oi.apply(G, a.map(R)); }

    // WebSockets go through libcurl.js -> Wisp
    if (isWin && cfg.pageWebSocket && LC && LC.WebSocket) {
      const wisp = cfg.wisp || (G.location.protocol === "https:" ? "wss:" : "ws:") + "//" + G.location.host + "/wisp/";
      // single-file build: the wasm is bundled, the argument is ignored but load_wasm() still resolves when ready
      safe(() => Promise.resolve(LC.load_wasm("")).then(() => LC.set_websocket(wisp)).catch(() => {}));
      const NativeWS = G.WebSocket;
      G.WebSocket = new Proxy(NativeWS, {
        construct(t, a) {
          try { return new LC.WebSocket(a[0], a[1]); } catch (e) { return Reflect.construct(t, a); }
        },
      });
    }

    if (G.history) for (const m of ["pushState", "replaceState"]) {
      const o = History.prototype[m];
      History.prototype[m] = function (s, t, u) { return o.call(this, s, t, u == null ? u : R(u)); };
    }
    if (G.open) { const oo = G.open; G.open = function (u, ...r) { const w = oo.call(this, u ? R(u) : u, ...r); if (!u || /^about:blank$/i.test(u)) inject(w); return w; }; }
    // postMessage masking. Every proxied site really lives on ONE origin (the proxy's), so a page that posts
    // to e.g. "https://platform.twitter.com" would throw "target origin does not match the recipient's origin".
    // NOTE: postMessage is an OWN property of each window instance ([Global] interface), not on
    // Window.prototype, so it has to be wrapped on the window object itself (each frame wraps its own,
    // which is also what runs when another frame calls  frame.postMessage(...)).
    if (isWin && typeof G.postMessage === "function") {
      const nativePM = G.postMessage;
      const wrapped = function postMessage(...a) {
        if (typeof a[1] === "string") a[1] = "*";                                              // (msg, targetOrigin[, transfer])
        else if (a[1] && typeof a[1] === "object" && !Array.isArray(a[1]) && "targetOrigin" in a[1]) a[1] = { ...a[1], targetOrigin: "*" }; // (msg, {targetOrigin, transfer})
        return nativePM.apply(this === undefined || this === null ? G : this, a);
      };
      safe(() => Object.defineProperty(wrapped, "toString", { value: () => "function postMessage() { [native code] }" }));
      safe(() => Object.defineProperty(G, "postMessage", { value: wrapped, writable: true, configurable: true, enumerable: true }));
      if (G.postMessage !== wrapped) safe(() => { G.postMessage = wrapped; });
    }
    // sites must not register their own service workers (would fight ours)
    // sites must not register their own service workers (they'd replace ours). Keep navigator.serviceWorker PRESENT
    // (deleting it is a detectable anomaly) but inert.
    safe(() => {
      const SC = G.ServiceWorkerContainer && G.ServiceWorkerContainer.prototype;
      if (!SC) return;
      SC.register = function register() { return Promise.reject(new DOMException("Failed to register a ServiceWorker: The document is in an invalid state.", "InvalidStateError")); };
      SC.getRegistration = function getRegistration() { return Promise.resolve(undefined); };
      SC.getRegistrations = function getRegistrations() { return Promise.resolve([]); };
    });
    safe(() => Object.defineProperty(G, "origin", { get: () => cur().origin, configurable: true }));
    if (G.indexedDB) {
      const pfx = () => cur().origin + "|";
      const io = IDBFactory.prototype.open, id = IDBFactory.prototype.deleteDatabase;
      IDBFactory.prototype.open = function (n, ...a) { return io.call(this, pfx() + n, ...a); };
      IDBFactory.prototype.deleteDatabase = function (n, ...a) { return id.call(this, pfx() + n, ...a); };
    }

    /* ---------- anti-detection: make every patched function look native ----------
       Google's "Search Guard" challenge (the page that says "If you're having trouble accessing Google
       Search…", url has emsg=SG_REL) fingerprints the environment, including fn.toString() of natives like
       fetch / XMLHttpRequest.open / document.cookie. Run once, after all patches are installed. */
    const finish = () => {
      safe(() => {
        const FTS = Function.prototype.toString, masked = new WeakMap();
        const NATIVE = /\{\s*\[native code\]\s*\}\s*$/;
        const nat = (f, label) => {
          if (typeof f !== "function" || masked.has(f)) return;
          try { if (!NATIVE.test(FTS.call(f))) masked.set(f, `function ${label}() { [native code] }`); } catch (e) {}
        };
        const targets = [G, Object.prototype];
        for (const n of ["Document", "Element", "Node", "HTMLElement", "ShadowRoot", "XMLHttpRequest", "History", "Navigator", "WorkerNavigator", "ServiceWorkerContainer",
          "CSSStyleDeclaration", "CSSStyleSheet", "IDBFactory", "MessageEvent", "Attr", "HTMLAnchorElement", "HTMLAreaElement", "HTMLLinkElement",
          "HTMLImageElement", "HTMLScriptElement", "HTMLStyleElement", "HTMLIFrameElement", "HTMLFrameElement", "HTMLMediaElement",
          "HTMLSourceElement", "HTMLTrackElement", "HTMLEmbedElement", "HTMLObjectElement", "HTMLInputElement", "HTMLFormElement", "HTMLVideoElement"])
          if (G[n] && G[n].prototype) targets.push(G[n].prototype);
        for (const o of targets) {
          for (const k of Reflect.ownKeys(o)) {
            let d; try { d = Object.getOwnPropertyDescriptor(o, k); } catch (e) { continue; }
            if (!d) continue;
            const nm = typeof k === "symbol" ? `[${k.description}]` : k;
            if (d.get) nat(d.get, "get " + nm);
            if (d.set) nat(d.set, "set " + nm);
            if (typeof d.value === "function" && k !== "constructor") nat(d.value, nm);
          }
        }
        // non-native functions: show their ORIGINAL source (undo our location/top/parent/eval rewrites)
        const fts = { toString() { const m = masked.get(this); if (m !== undefined) return m; const s = FTS.call(this); return s.indexOf("fastsw") < 0 ? s : core.unrewriteJS(s); } }.toString;
        masked.set(fts, "function toString() { [native code] }");
        Object.defineProperty(Function.prototype, "toString", { value: fts, writable: true, configurable: true, enumerable: false });
      });
      safe(() => { delete G.__fastswBoot; });
      // stack traces: show real site URLs instead of /fastsw/service/<encoded>, and hide our own frames
      safe(() => {
        if (typeof Error.prepareStackTrace !== "undefined") return;
        const clean = (s) => s.replace(/(?:https?:\/\/[^\/\s()]+)?\/fastsw\/service\/([^:\s()]+)/g, (m, e) => { try { return decodeURIComponent(e); } catch (x) { return m; } });
        Error.prepareStackTrace = function (err, frames) {
          let head; try { head = String(err); } catch (e) { head = "Error"; }
          const lines = [];
          for (const f of frames) { const t = String(f); if (t.indexOf(cfg.clientPath) < 0) lines.push("    at " + t); }
          return clean(head + (lines.length ? "\n" + lines.join("\n") : ""));
        };
      });
    };

    if (!isWin) { finish(); return; }

    /* ---------- DOM ---------- */
    const getter = (proto, prop, fn) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.get) return;
      Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get() { return fn(d.get.call(this), this); }, set: d.set });
    };
    const setter = (proto, prop, fn) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { ...d, set(v) { d.set.call(this, fn(v, this)); } });
    };
    const D = Document.prototype;
    getter(D, "URL", () => lurl().href);
    getter(D, "documentURI", () => lurl().href);
    getter(D, "referrer", (v) => core.unrewrite(v));
    getter(D, "domain", () => cur().hostname);
    getter(Node.prototype, "baseURI", (v) => core.unrewrite(v));

    // cookies (jar lives in the SW; non-HttpOnly cookies are mirrored here)
    const cj = new Map();
    String(boot.cookie || "").split(/;\s*/).forEach((c) => { const i = c.indexOf("="); if (i > 0) cj.set(c.slice(0, i), c.slice(i + 1)); });
    Object.defineProperty(D, "cookie", {
      configurable: true,
      get() { return [...cj].map(([k, v]) => k + "=" + v).join("; "); },
      set(v) {
        v = String(v);
        const [nv, ...at] = v.split(";");
        const i = nv.indexOf("=");
        const k = i < 0 ? "" : nv.slice(0, i).trim(), val = i < 0 ? nv.trim() : nv.slice(i + 1).trim();
        const low = at.join(";").toLowerCase();
        const ex = /expires\s*=([^;]+)/.exec(low);
        const dead = /max-age\s*=\s*(0|-)/.test(low) || (ex && Date.parse(ex[1]) <= Date.now());
        if (dead) cj.delete(k); else cj.set(k, val);
        post({ type: "fastsw:cookie", url: base(), cookie: v });
      },
    });

    // <a>.hostname etc. should describe the real target, not the proxy
    for (const p of ["protocol", "host", "hostname", "port", "pathname", "search", "hash", "origin"])
      getter(HTMLAnchorElement.prototype, p, (v, el) => safe(() => new URL(core.unrewrite(el.href))[p], v));

    // URL-bearing properties
    const UP = [["HTMLAnchorElement", "href"], ["HTMLAreaElement", "href"], ["HTMLLinkElement", "href"], ["HTMLImageElement", "src"],
      ["HTMLScriptElement", "src"], ["HTMLIFrameElement", "src"], ["HTMLFrameElement", "src"], ["HTMLMediaElement", "src"],
      ["HTMLSourceElement", "src"], ["HTMLTrackElement", "src"], ["HTMLEmbedElement", "src"], ["HTMLObjectElement", "data"],
      ["HTMLInputElement", "src"], ["HTMLFormElement", "action"], ["HTMLVideoElement", "poster"]];
    for (const [cn, prop] of UP) {
      const C = G[cn]; if (!C) continue;
      const d = Object.getOwnPropertyDescriptor(C.prototype, prop); if (!d || !d.get) continue;
      Object.defineProperty(C.prototype, prop, { configurable: true, enumerable: d.enumerable,
        get() { return core.unrewrite(d.get.call(this)); }, set(v) { d.set.call(this, R(v)); } });
    }

    for (const C of [HTMLIFrameElement, G.HTMLFrameElement, G.HTMLObjectElement, G.HTMLEmbedElement]) {
      if (!C) continue;
      getter(C.prototype, "contentWindow", (w) => { inject(w); return w; });
      getter(C.prototype, "contentDocument", (d) => { if (d) inject(d.defaultView); return d; });
    }
    // event.origin must be the SENDER's site origin (not the proxy's, and not the receiver's own)
    getter(MessageEvent.prototype, "origin", (v, ev) => {
      if (v !== G.location.origin) return v;
      try { const s = ev.source; if (s && s.fastsw) return s.fastsw.location.origin; } catch (e) {}
      return cur().origin;
    });
    for (const C of [HTMLImageElement, HTMLSourceElement]) setter(C.prototype, "srcset", (v) => core.rewriteSrcset(String(v), base()));
    const URLA = new Set(["href", "src", "action", "poster", "data", "formaction", "background", "manifest"]);
    if (G.Attr) setter(Attr.prototype, "value", (v, a) => (URLA.has(a.name.toLowerCase()) ? R(v) : v));
    const E = Element.prototype, sa = E.setAttribute, ga = E.getAttribute;
    E.setAttribute = function (n, v) {
      const l = String(n).toLowerCase(); v = String(v);
      if (l === "integrity") return;
      if (URLA.has(l)) v = /^\s*javascript:/i.test(v) ? "javascript:" + core.rewriteJS(v.replace(/^\s*javascript:/i, ""), base()) : R(v);
      else if (l === "srcset" || l === "imagesrcset") v = core.rewriteSrcset(v, base());
      else if (l === "style") v = core.rewriteCSS(v, base());
      else if (/^on[a-z]+$/.test(l)) v = core.rewriteJS(v, base());
      return sa.call(this, n, v);
    };
    E.getAttribute = function (n) { const v = ga.call(this, n); return URLA.has(String(n).toLowerCase()) ? core.unrewrite(v) : v; };

    // dynamic HTML
    const rh = (v) => core.rewriteHTML(String(v), base(), false);
    setter(E, "innerHTML", rh); setter(E, "outerHTML", rh);
    if (G.ShadowRoot) setter(ShadowRoot.prototype, "innerHTML", rh);
    const iah = E.insertAdjacentHTML;
    E.insertAdjacentHTML = function (p, h) { return iah.call(this, p, rh(h)); };
    for (const m of ["write", "writeln"]) { const o = D[m]; D[m] = function (...a) { return o.apply(this, a.map(rh)); }; }

    // dynamic scripts / styles
    const rjs = (el, v) => {
      if (v == null) return v;
      if (el instanceof HTMLScriptElement) { const t = el.type; return !t || /javascript|module|ecmascript/i.test(t) ? core.rewriteJS(String(v), base()) : v; }
      if (el instanceof HTMLStyleElement) return core.rewriteCSS(String(v), base());
      return v;
    };
    setter(HTMLScriptElement.prototype, "text", (v, el) => rjs(el, v));
    setter(Node.prototype, "textContent", (v, el) => rjs(el, v));
    setter(HTMLElement.prototype, "innerText", (v, el) => rjs(el, v));
    // scripts that read their own source must see the original text, not our rewritten version
    getter(HTMLScriptElement.prototype, "text", (v) => (typeof v === "string" ? core.unrewriteJS(v) : v));
    getter(Node.prototype, "textContent", (v, el) => (typeof v === "string" && el instanceof HTMLScriptElement ? core.unrewriteJS(v) : v));
    const ac = Node.prototype.appendChild;
    Node.prototype.appendChild = function (c) {
      if (c && c.nodeType === 3 && (this instanceof HTMLScriptElement || this instanceof HTMLStyleElement)) c.data = rjs(this, c.data);
      return ac.call(this, c);
    };

    // inline styles / stylesheets
    const CS = CSSStyleDeclaration.prototype;
    for (const p of ["cssText", "backgroundImage", "background", "maskImage", "listStyleImage", "content", "cursor", "borderImage"])
      setter(CS, p, (v) => (typeof v === "string" ? core.rewriteCSS(v, base()) : v));
    const sp = CS.setProperty;
    CS.setProperty = function (n, v, p) { return sp.call(this, n, typeof v === "string" && v.includes("url(") ? core.rewriteCSS(v, base()) : v, p); };
    if (G.CSSStyleSheet) {
      const S = CSSStyleSheet.prototype, ir = S.insertRule;
      S.insertRule = function (r, i) { return ir.call(this, core.rewriteCSS(r, base()), i); };
      for (const m of ["replace", "replaceSync"]) { const o = S[m]; if (o) S[m] = function (c) { return o.call(this, core.rewriteCSS(c, base())); }; }
    }

    // per-site storage isolation (every proxied site shares one real origin)
    const mkStore = (real) => {
      const P = () => cur().origin + "|";
      const keys = () => { const r = [], p = P(); for (let i = 0; i < real.length; i++) { const k = real.key(i); if (k.startsWith(p)) r.push(k.slice(p.length)); } return r; };
      return new Proxy({}, {
        get(_, k) {
          switch (k) {
            case "getItem": return (x) => real.getItem(P() + x);
            case "setItem": return (x, v) => real.setItem(P() + x, v);
            case "removeItem": return (x) => real.removeItem(P() + x);
            case "clear": return () => keys().forEach((x) => real.removeItem(P() + x));
            case "key": return (i) => (keys()[i] === undefined ? null : keys()[i]);
            case "length": return keys().length;
          }
          if (typeof k === "symbol") return undefined;
          const v = real.getItem(P() + k); return v === null ? undefined : v;
        },
        set(_, k, v) { real.setItem(P() + k, v); return true; },
        deleteProperty(_, k) { real.removeItem(P() + k); return true; },
        has(_, k) { return real.getItem(P() + k) !== null; },
        ownKeys() { return keys(); },
        getOwnPropertyDescriptor(_, k) { const v = real.getItem(P() + k); return v === null ? undefined : { value: v, enumerable: true, configurable: true, writable: true }; },
      });
    };
    for (const n of ["localStorage", "sessionStorage"]) {
      const real = safe(() => G[n]); if (!real) continue;
      const px = mkStore(real);
      safe(() => Object.defineProperty(G, n, { get: () => px, configurable: true }));
    }
    finish();
  }

  /* ================================================================== *
   *  Service worker side
   * ================================================================== */
  const IN_SW = typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope;

  if (IN_SW) {
    importScripts(CONFIG.libcurlJS);                   // single-file build: defines `libcurl` (wasm bundled)

    const core = FastswCore(CONFIG, makeAcorn());
    const ORIGIN = self.location.origin;
    const PREFIX = CONFIG.prefix;
    const ASSET_PATHS = new Set([CONFIG.libcurlJS].map((x) => {
      try { const a = new URL(x, ORIGIN); return a.origin === ORIGIN ? a.pathname : ""; } catch (e) { return ""; }
    }).filter(Boolean));
    const WISP = CONFIG.wisp || (self.location.protocol === "https:" ? "wss:" : "ws:") + "//" + self.location.host + "/wisp/";

    /* ---------------- tiny IndexedDB KV (cookie persistence) ---------------- */
    const idb = (mode, fn) => new Promise((res, rej) => {
      const o = indexedDB.open("fastsw", 1);
      o.onupgradeneeded = () => o.result.createObjectStore("kv");
      o.onerror = () => rej(o.error);
      o.onsuccess = () => {
        const tx = o.result.transaction("kv", mode);
        const r = fn(tx.objectStore("kv"));
        tx.oncomplete = () => res(r && r.result);
        tx.onerror = () => rej(tx.error);
      };
    });

    /* ---------------- cookie jar ---------------- */
    const jar = {
      map: new Map(),
      timer: 0,
      persist() { clearTimeout(this.timer); this.timer = setTimeout(() => idb("readwrite", (s) => s.put([...this.map], "cookies")).catch(() => {}), 100); },
      loaded() { return this._p || (this._p = this.load()); },       // load saved cookies once (before any persist can overwrite them)
      async load() { try { const a = await idb("readonly", (s) => s.get("cookies")); if (a) for (const [k, c] of a) if (!this.map.has(k)) this.map.set(k, c); } catch (e) {} },   // merge: never drop cookies set before the load finished
      set(url, line) {
        const u = new URL(url);
        const [nv, ...attrs] = String(line).split(";");
        const eq = nv.indexOf("=");
        if (eq < 1) return;
        const c = { name: nv.slice(0, eq).trim(), value: nv.slice(eq + 1).trim(), domain: u.hostname, hostOnly: true,
          path: u.pathname.lastIndexOf("/") > 0 ? u.pathname.slice(0, u.pathname.lastIndexOf("/")) : "/", expires: 0, secure: false, httpOnly: false };
        for (const a of attrs) {
          const i = a.indexOf("="); const k = (i < 0 ? a : a.slice(0, i)).trim().toLowerCase(); const v = i < 0 ? "" : a.slice(i + 1).trim();
          if (k === "domain" && v) { c.domain = v.replace(/^\./, "").toLowerCase(); c.hostOnly = false; }
          else if (k === "path" && v.startsWith("/")) c.path = v;
          else if (k === "expires") { const t = Date.parse(v); if (!isNaN(t)) c.expires = t; }
          else if (k === "max-age") c.expires = Date.now() + parseInt(v, 10) * 1000;
          else if (k === "secure") c.secure = true;
          else if (k === "httponly") c.httpOnly = true;
        }
        const key = `${c.domain}|${c.path}|${c.name}`;
        if (c.expires && c.expires <= Date.now()) this.map.delete(key); else this.map.set(key, c);
        this.persist();
      },
      get(url, js) {
        const u = new URL(url), now = Date.now(), out = [];
        for (const [k, c] of this.map) {
          if (c.expires && c.expires <= now) { this.map.delete(k); continue; }
          const dm = c.hostOnly ? u.hostname === c.domain : u.hostname === c.domain || u.hostname.endsWith("." + c.domain);
          if (!dm || !(u.pathname === c.path || u.pathname.startsWith(c.path.endsWith("/") ? c.path : c.path + "/"))) continue;
          if (c.secure && u.protocol !== "https:") continue;
          if (js && c.httpOnly) continue;
          out.push(`${c.name}=${c.value}`);
        }
        return out.join("; ");
      },
    };

    let readyP = null;
    const ensureReady = () => readyP || (readyP = (async () => {
      await libcurl.load_wasm("");                      // wasm is bundled in libcurl_full.js; resolves when ready
      libcurl.set_websocket(WISP);
      await jar.loaded();
    })().catch((e) => { readyP = null; throw e; }));   // retry on next request if the wasm / Wisp setup failed

    /* ---------------- header policy ---------------- */
    const STRIP = new Set([
      "content-security-policy", "content-security-policy-report-only", "x-content-security-policy", "x-webkit-csp",
      "x-frame-options", "frame-options", "cross-origin-opener-policy", "cross-origin-embedder-policy",
      "cross-origin-resource-policy", "permissions-policy", "feature-policy", "referrer-policy", "report-to", "nel",
      "strict-transport-security", "public-key-pins", "clear-site-data", "expect-ct", "alt-svc", "link", "x-xss-protection",
      "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "x-content-type-options",
      "timing-allow-origin", "origin-agent-cluster", "accept-ch", "critical-ch",
    ]);
    const DROP_REQ = new Set(["host", "origin", "referer", "cookie", "connection", "accept-encoding", "content-length", "keep-alive", "te", "upgrade", "proxy-connection"]);
    const NULL_BODY = new Set([101, 204, 205, 304]);
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

    function decodeText(buf, ct) {
      const m = /charset=["']?([\w-]+)/i.exec(ct || "");
      try { return new TextDecoder(m ? m[1] : "utf-8").decode(buf); } catch (e) { return new TextDecoder().decode(buf); }
    }

    let clientSrc = null;
    function clientScript() {
      if (!clientSrc) clientSrc = `(${fastswRuntime.toString()})(${FastswCore.toString()},${JSON.stringify(CONFIG)},(function(){var e={};(${ACORN_FACTORY.toString()})(e);return e})());`;
      const src = clientSrc;
      return new Response(src, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
    }

    /* ---------------- the proxy request ---------------- */
    async function proxy(req, target, page) {
      await ensureReady();
      const t = new URL(target);
      const h = {};
      for (const [k, v] of req.headers) if (!DROP_REQ.has(k)) h[k] = v;
      // A service worker never sees the headers the browser adds itself (UA client hints, Accept-Language,
      // Sec-Fetch-*), so libcurl would send a bare request and Google would answer with its "old browser /
      // no JavaScript" page. Rebuild the headers a real Chrome navigation/fetch would have sent.
      const nav = req.mode === "navigate";
      const dflt = (k, v) => { if (v != null && !(k in h)) h[k] = v; };
      const nv = self.navigator, uaStr = nv.userAgent, uad = nv.userAgentData;
      dflt("user-agent", uaStr);
      dflt("accept", nav ? "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7" : "*/*");
      dflt("accept-language", (nv.languages && nv.languages.length ? nv.languages : [nv.language || "en-US"]).map((l, i) => (i ? `${l};q=${Math.max(0.1, 1 - i * 0.1).toFixed(1)}` : l)).join(","));
      const cm = /Chrom(?:e|ium)\/(\d+)/.exec(uaStr);
      if (uad && uad.brands && uad.brands.length) {
        dflt("sec-ch-ua", uad.brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", "));
        dflt("sec-ch-ua-mobile", uad.mobile ? "?1" : "?0");
        dflt("sec-ch-ua-platform", `"${uad.platform || "Windows"}"`);
      } else if (cm) {
        dflt("sec-ch-ua", `"Chromium";v="${cm[1]}", "Not.A/Brand";v="24", "Google Chrome";v="${cm[1]}"`);
        dflt("sec-ch-ua-mobile", /Mobile/i.test(uaStr) ? "?1" : "?0");
        dflt("sec-ch-ua-platform", `"${/Windows/.test(uaStr) ? "Windows" : /Mac OS/.test(uaStr) ? "macOS" : /Android/.test(uaStr) ? "Android" : /CrOS/.test(uaStr) ? "Chrome OS" : "Linux"}"`);
      }
      let site = "none";
      if (page) {
        try {
          const pu = new URL(page), reg = (x) => x.hostname.split(".").slice(-2).join(".");
          site = pu.origin === t.origin ? "same-origin" : reg(pu) === reg(t) ? "same-site" : "cross-site";
        } catch (e) { site = "cross-site"; }
      }
      dflt("sec-fetch-dest", nav ? "document" : req.destination || "empty");
      dflt("sec-fetch-mode", req.mode === "same-origin" ? "cors" : req.mode);
      dflt("sec-fetch-site", site);
      if (nav) { dflt("sec-fetch-user", "?1"); dflt("upgrade-insecure-requests", "1"); }
      if (page) {
        h.referer = page;
        if ((req.method !== "GET" && req.method !== "HEAD") || req.headers.has("origin")) h.origin = new URL(page).origin;
      }
      const ck = jar.get(t.href, false);
      if (ck) h.cookie = ck;
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();

      const r = await libcurl.fetch(t.href, { method: req.method, headers: h, body, redirect: "manual" });

      const out = new Headers();
      const raw = r.raw_headers || Array.from(r.headers.entries());
      let sawCookie = false;
      for (const [k, v] of raw) {
        const lk = k.toLowerCase();
        if (lk === "set-cookie") { sawCookie = true; jar.set(t.href, v); continue; }
        if (STRIP.has(lk)) continue;
        if (lk === "location") { out.set("location", core.rewriteURL(v, t.href)); continue; }
        out.append(k, v);
      }
      if (!sawCookie && r.headers && typeof r.headers.getSetCookie === "function") r.headers.getSetCookie().forEach((c) => jar.set(t.href, c));
      out.set("access-control-allow-origin", ORIGIN);
      out.set("access-control-allow-credentials", "true");

      if (r.status >= 300 && r.status < 400 && out.has("location")) return new Response(null, { status: r.status, headers: out });

      const ct = out.get("content-type") || "";
      const dest = req.destination;
      let kind = null;
      if (dest === "script" || dest === "worker" || dest === "sharedworker") kind = "js";
      else if (dest === "style") kind = "css";
      else if (/html/i.test(ct)) kind = "html";
      else if (/(java|ecma)script/i.test(ct)) kind = "js";
      else if (/text\/css/i.test(ct)) kind = "css";

      if (!kind || NULL_BODY.has(r.status)) {
        return new Response(NULL_BODY.has(r.status) ? null : r.body, { status: r.status, statusText: r.statusText, headers: out });
      }

      const text = decodeText(await r.arrayBuffer(), ct);
      let res;
      if (kind === "html") {
        const inject = dest === "document" || dest === "iframe" || dest === "frame" || dest === "embed" || dest === "object";
        res = core.rewriteHTML(text, t.href, inject, { cookie: jar.get(t.href, true) });
      } else if (kind === "css") res = core.rewriteCSS(text, t.href);
      else {
        res = core.rewriteJS(text, t.href);
        if (dest === "worker" || dest === "sharedworker") {
          const C = JSON.stringify(CONFIG.clientPath);
          res = new URL(req.url).searchParams.has("fastsw_module")
            ? `import ${C};` + res                                               // module worker
            : `self.__fastswBoot={};importScripts(${C});` + res;                // classic worker
        }
      }
      const mime = ct.replace(/;\s*charset=[^;]*/i, "") || { html: "text/html", js: "text/javascript", css: "text/css" }[kind];
      out.set("content-type", mime + "; charset=utf-8");
      return new Response(res, { status: r.status, statusText: r.statusText, headers: out });
    }

    async function handle(e) {
      const req = e.request, u = new URL(req.url);
      try {
        if (u.origin === ORIGIN && u.pathname === CONFIG.clientPath) return clientScript();
        if (u.origin === ORIGIN && ASSET_PATHS.has(u.pathname)) return fetch(req);        // self-hosted libcurl / acorn: serve as-is, never proxy

        let target, page = null;
        const refStr = req.referrer && req.referrer.startsWith(ORIGIN + PREFIX) ? req.referrer : null;

        if (u.origin === ORIGIN && u.pathname.startsWith(PREFIX)) {
          target = core.decode(u.pathname);
          // A GET <form> submit (e.g. Google's search box) replaces the query of its action URL, so the
          // browser sends  /fastsw/service/<enc(action)>?q=foo . The real query lives in u.search; the
          // encoded target never has its own "?" (encodeURIComponent turns it into %3F), so just swap it in.
          if (u.search) { try { const tu = new URL(target); tu.search = u.search; target = tu.href; } catch (err) {} }
          if (refStr) page = core.decode(new URL(refStr).pathname);
        } else {
          // request escaped the rewriter: resolve it against whichever proxied page made it
          const client = e.clientId ? await self.clients.get(e.clientId) : null;
          const ref = client && client.url && client.url.startsWith(ORIGIN + PREFIX) ? client.url : refStr;
          if (!ref) return fetch(req);                           // not a proxied client (e.g. index.html itself)
          page = core.decode(new URL(ref).pathname);
          target = u.origin === ORIGIN ? new URL(u.pathname + u.search, page).href : req.url;
        }
        if (!/^https?:/i.test(target)) return new Response("Bad target: " + target, { status: 400 });
        return await proxy(req, target, page);
      } catch (err) {
        return new Response(
          `<!doctype html><meta charset=utf-8><title>FastSW error</title><body style="font:15px system-ui;padding:2rem;background:#0b0d12;color:#e6e8ee"><h2>FastSW couldn't load this page</h2><pre style="white-space:pre-wrap">${esc(err && err.stack || err)}</pre>`,
          { status: 502, headers: { "content-type": "text/html; charset=utf-8" } });
      }
    }

    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", (e) => e.respondWith(handle(e)));
    self.addEventListener("message", (e) => {
      const d = e.data;
      if (d && d.type === "fastsw:cookie") {
        const port = e.ports && e.ports[0];
        e.waitUntil((async () => {
          try { await jar.loaded(); jar.set(d.url, d.cookie); } catch (err) {}
          try { port && port.postMessage(1); } catch (err) {}      // ack: the page may now navigate
        })());
      }
    });

  /* ================================================================== *
   *  Page side (index.html)
   * ================================================================== */
  } else if (typeof window !== "undefined") {
    const SELF_SRC = (document.currentScript && document.currentScript.src) || "/fastsw.all.js";
    const encode = (u) => { const i = u.indexOf("#"); return CONFIG.prefix + encodeURIComponent(i < 0 ? u : u.slice(0, i)) + (i < 0 ? "" : u.slice(i)); };

    window.Fastsw = {
      CONFIG,
      encode,
      core: FastswCore,
      makeAcorn,
      async register() {
        if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported (need https:// or localhost).");
        await navigator.serviceWorker.register(SELF_SRC, { scope: "/", updateViaCache: "none" });
        await navigator.serviceWorker.ready;
      },
      /** Turn address-bar text into a URL (or a search) and navigate to the proxied version. */
      go(input, { search = "https://duckduckgo.com/?q=%s", target } = {}) {
        input = String(input || "").trim();
        if (!input) return;
        let url;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) url = input;
        else if (/^[^\s/]+\.[a-z]{2,}(?::\d+)?(\/\S*)?$/i.test(input) || /^localhost(:\d+)?(\/\S*)?$/i.test(input)) url = "https://" + input;
        else url = search.replace("%s", encodeURIComponent(input));
        const dest = encode(url);
        if (target) target.location.href = dest; else window.location.href = dest;
      },
    };
  }
})();
