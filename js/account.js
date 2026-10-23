/* Islamdle — optional "Sign in with Google" (Supabase).
 *
 * Signing in does two things and nothing else:
 *  - the day streak follows you between devices (table played_days), and
 *  - if you donated on Buy Me a Coffee with the same email, ads switch off
 *    on every device you sign in on (see js/support.js and /api/supporter).
 *
 * The Supabase library (~220 KB) is only downloaded for people who are signed
 * in or press "Sign in", never for everyone else.
 *
 * While SUPABASE_URL or SUPABASE_ANON_KEY is empty, nothing here shows.
 */
(function (w, d, I) {
  "use strict";

  // Supabase → Project Settings → API. The anon key is public by design;
  // row-level security in the database is what protects the data.
  var SUPABASE_URL = "";
  var SUPABASE_ANON_KEY = "";

  var LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";
  var LIB_SRI = "sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok";

  var client = null;
  var session = null;
  var starting = null;
  var listeners = [];

  function configured() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); }

  // Only load the library when it can matter: a saved session, or coming back
  // from Google with ?code= in the address.
  function needed() {
    if (/[?&]code=/.test(w.location.search)) return true;
    try {
      for (var i = 0; i < w.localStorage.length; i++) {
        if (/^sb-.+-auth-token$/.test(w.localStorage.key(i))) return true;
      }
    } catch (e) { /* storage blocked */ }
    return false;
  }

  function loadLib() {
    if (w.supabase && w.supabase.createClient) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = d.createElement("script");
      s.src = LIB;
      s.integrity = LIB_SRI;
      s.crossOrigin = "anonymous";
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Could not load sign-in")); };
      d.head.appendChild(s);
    });
  }

  function start() {
    if (!configured()) return Promise.reject(new Error("Sign-in is not set up"));
    if (starting) return starting;
    starting = loadLib().then(function () {
      client = w.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
      });
      client.auth.onAuthStateChange(function (event, s) { setSession(s); });
      return client.auth.getSession();
    }).then(function (res) {
      setSession(res && res.data ? res.data.session : null);
      cleanUrl();
    });
    starting.catch(function () { starting = null; });
    return starting;
  }

  // Drop the one-time ?code= Google sends back, keep ?mode= and ?level=.
  function cleanUrl() {
    if (!/[?&]code=/.test(w.location.search)) return;
    var params = new URLSearchParams(w.location.search);
    params.delete("code");
    var q = params.toString();
    w.history.replaceState(null, "", w.location.pathname + (q ? "?" + q : "") + w.location.hash);
  }

  var lastUserId = null;

  function setSession(s) {
    session = s || null;
    var id = session ? session.user.id : null;
    if (id === lastUserId) return;
    lastUserId = id;
    listeners.forEach(function (fn) { fn(user()); });
    if (session) syncDays();
  }

  function user() {
    if (!session) return null;
    var u = session.user;
    var meta = u.user_metadata || {};
    return { id: u.id, email: u.email, name: meta.full_name || meta.name || u.email };
  }

  /* --------------------------------------------------------- streaks ---- */

  // Send this device's days up, pull every device's days down, recount.
  function syncDays() {
    if (!client || !session) return Promise.resolve();
    var uid = session.user.id;
    var rows = I.playedDays().map(function (n) { return { user_id: uid, n: n }; });
    var up = rows.length
      ? client.from("played_days").upsert(rows, { onConflict: "user_id,n", ignoreDuplicates: true })
      : Promise.resolve({});
    return up.then(function () {
      return client.from("played_days").select("n").order("n", { ascending: false }).limit(1000);
    }).then(function (res) {
      if (res.error) return;
      I.mergeDays(res.data.map(function (r) { return r.n; }));
      listeners.forEach(function (fn) { fn(user()); });
    });
  }

  I.onDayPlayed(function (n) {
    if (!client || !session) return;
    client.from("played_days")
      .upsert([{ user_id: session.user.id, n: n }], { onConflict: "user_id,n", ignoreDuplicates: true })
      .then(function () { /* best effort; the next sign-in syncs anyway */ });
  });

  /* ---------------------------------------------------------- public ---- */

  function signIn() {
    return start().then(function () {
      return client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: w.location.href.split("#")[0] }
      });
    });
  }

  function signOut() {
    if (!client) return Promise.resolve();
    return client.auth.signOut().then(function () { setSession(null); });
  }

  // Fresh access token for /api/supporter; the library refreshes it as needed.
  function accessToken() {
    if (!client) return Promise.resolve(null);
    return client.auth.getSession().then(function (res) {
      var s = res && res.data ? res.data.session : null;
      return s ? s.access_token : null;
    });
  }

  w.IslamdleAccount = {
    configured: configured,
    user: user,
    signIn: signIn,
    signOut: signOut,
    accessToken: accessToken,
    // fn(user or null) now and on every sign-in, sign-out and streak sync.
    onChange: function (fn) { listeners.push(fn); fn(user()); }
  };

  if (configured() && needed()) start().catch(function () { /* stays signed out */ });
})(window, document, window.Islamdle);
