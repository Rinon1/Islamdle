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
  var SUPABASE_URL = "https://ymkqdccstwccwaovigcr.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_hAq6ZcNY9CE075JIvM_tDA_FaoluixU";

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

  /* ------------------------------------------------------- sign in ---- */

  // What to open once the visitor comes back signed in (e.g. "support"). Kept
  // in localStorage because an email link may open in a new tab.
  var NEXT_KEY = "islamdle.after-signin";

  function rememberNext(next) {
    try {
      if (next) w.localStorage.setItem(NEXT_KEY, JSON.stringify({ next: next, at: Date.now() }));
      else w.localStorage.removeItem(NEXT_KEY);
    } catch (e) { /* storage blocked */ }
  }

  function takeNext() {
    var v = null;
    try { v = JSON.parse(w.localStorage.getItem(NEXT_KEY)); w.localStorage.removeItem(NEXT_KEY); } catch (e) { /* ignore */ }
    return v && Date.now() - v.at < 3600 * 1000 ? v.next : null;
  }

  function here() { return w.location.href.split("#")[0]; }

  function signInGoogle() {
    return start().then(function () {
      return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } });
    });
  }

  // Passwordless: Supabase emails a link that signs in, creating the account
  // the first time. The address only counts once that link is opened, so
  // nobody can register someone else's email to claim their donation.
  function signInEmail(email) {
    return start().then(function () {
      return client.auth.signInWithOtp({ email: email, options: { emailRedirectTo: here(), shouldCreateUser: true } });
    }).then(function (res) {
      if (res && res.error) throw res.error;
    });
  }

  var GOOGLE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>' +
    '<path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1C3.4 21.4 7.4 24 12 24z"/>' +
    '<path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5h-4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z"/>' +
    '<path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1c.9-2.8 3.5-4.8 6.6-4.8z"/>' +
    "</svg>";

  function el(id) { return d.getElementById(id); }

  function injectDialog() {
    var box = d.createElement("div");
    box.className = "modal";
    box.id = "modal-signin";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "si-title");
    box.innerHTML =
      '<div class="box signin">' +
        '<button class="btn ghost close" type="button" id="si-close">Close</button>' +
        '<h2 id="si-title">Sign in</h2>' +
        '<p id="si-why"></p>' +
        '<div id="si-form">' +
          '<button class="btn google si-google" type="button" id="si-google">' + GOOGLE_ICON + "Continue with Google</button>" +
          '<div class="si-or"><span>or</span></div>' +
          '<form id="si-email-form" class="si-email-row">' +
            '<input type="email" id="si-email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address">' +
            '<button class="btn" type="submit" id="si-email-btn">Email me a link</button>' +
          "</form>" +
          '<p class="si-note">No password. New here? The link creates your account.</p>' +
        "</div>" +
        '<div id="si-sent" hidden>' +
          '<p class="sp-big">Check your email</p>' +
          "<p>We sent a sign-in link to <b id=\"si-sent-to\"></b>. Open it <b>on this device</b> and you’ll come straight back here, signed in.</p>" +
          '<button class="link-btn" type="button" id="si-again">Use a different email</button>' +
        "</div>" +
        '<p class="sp-status" id="si-status" role="status"></p>' +
        '<button class="link-btn si-code" type="button" id="si-code" hidden>Rather not sign in? Use a supporter code</button>' +
      "</div>";
    d.body.appendChild(box);

    el("si-close").onclick = closeDialog;
    box.addEventListener("click", function (e) { if (e.target === box) closeDialog(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) closeDialog(); });

    el("si-google").onclick = function () {
      status("Opening Google…");
      signInGoogle().catch(function () { status("Sign-in isn’t available right now. Please try again later.", "bad"); });
    };

    el("si-email-form").onsubmit = function (e) {
      e.preventDefault();
      var email = el("si-email").value.trim();
      el("si-email-btn").disabled = true;
      status("Sending…");
      signInEmail(email).then(function () {
        status("");
        el("si-sent-to").textContent = email;
        el("si-form").hidden = true;
        el("si-sent").hidden = false;
      }, function (err) {
        var msg = err && /rate|limit|seconds/i.test(err.message || "")
          ? "Too many sign-in emails right now. Please wait a little, or continue with Google."
          : "Couldn’t send the email. Check the address, or continue with Google.";
        status(msg, "bad");
      }).then(function () { el("si-email-btn").disabled = false; });
    };

    el("si-again").onclick = function () {
      el("si-sent").hidden = true;
      el("si-form").hidden = false;
      el("si-email").focus();
    };

    el("si-code").onclick = function () {
      closeDialog();
      rememberNext(null);
      if (w.IslamdleSupport) w.IslamdleSupport.open(null, { code: true });
    };
  }

  function status(text, kind) {
    var s = el("si-status");
    s.textContent = text;
    s.className = "sp-status" + (kind ? " " + kind : "");
  }

  // opts: { title, why, next: "support", codeLink: bool }
  function openDialog(opts) {
    opts = opts || {};
    if (!el("modal-signin")) injectDialog();
    el("si-title").textContent = opts.title || "Sign in";
    el("si-why").textContent = opts.why ||
      "Keep your streak on every device. If you’ve donated, ads switch off by themselves.";
    el("si-code").hidden = !opts.codeLink;
    el("si-form").hidden = false;
    el("si-sent").hidden = true;
    status("");
    rememberNext(opts.next || null);
    el("modal-signin").hidden = false;
    el("si-google").focus();
    start().catch(function () { /* the buttons report it */ });
  }

  function closeDialog() {
    var box = el("modal-signin");
    if (box) box.hidden = true;
  }

  // Signed in (maybe in another tab, from the email link): close the dialog
  // and carry on with what the visitor was doing.
  listeners.push(function (u) {
    if (!u) return;
    closeDialog();
    if (takeNext() === "support" && w.IslamdleSupport) w.IslamdleSupport.open();
  });

  /* ---------------------------------------------------------- public ---- */

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
    openSignIn: openDialog,
    signOut: signOut,
    accessToken: accessToken,
    // fn(user or null) now and on every sign-in, sign-out and streak sync.
    onChange: function (fn) { listeners.push(fn); fn(user()); }
  };

  if (configured() && needed()) start().catch(function () { /* stays signed out */ });
})(window, document, window.Islamdle);
