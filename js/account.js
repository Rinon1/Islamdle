/* Islamdle — optional "Sign in with Google" (Supabase).
 *
 * Email + password (with a confirmation email) or Google. Signing in does
 * two things and nothing else:
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
      client.auth.onAuthStateChange(function (event, s) {
        setSession(s);
        if (event === "PASSWORD_RECOVERY") recovering();
      });
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

  // What to open once the visitor comes back signed in (e.g. "support"), and
  // whether they are coming back from a password-reset email. Kept in
  // localStorage because an email link may open in a new tab.
  var NEXT_KEY = "islamdle.after-signin";
  var RESET_KEY = "islamdle.reset-pending";
  var HOUR = 3600 * 1000;
  var MIN_PASSWORD = 8;

  function remember(key, value) {
    try {
      if (value) w.localStorage.setItem(key, JSON.stringify({ v: value, at: Date.now() }));
      else w.localStorage.removeItem(key);
    } catch (e) { /* storage blocked */ }
  }

  function take(key) {
    var v = null;
    try { v = JSON.parse(w.localStorage.getItem(key)); w.localStorage.removeItem(key); } catch (e) { /* ignore */ }
    return v && Date.now() - v.at < HOUR ? v.v : null;
  }

  function here() { return w.location.href.split("#")[0]; }

  function check(res) {
    if (res && res.error) throw res.error;
    return res ? res.data : null;
  }

  function signInGoogle() {
    remember(RESET_KEY, null);
    return start().then(function () {
      return client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } });
    });
  }

  function signInPassword(email, password) {
    remember(RESET_KEY, null);
    return start().then(function () {
      return client.auth.signInWithPassword({ email: email, password: password });
    }).then(check);
  }

  // A new account only works once its confirmation link is opened. That is
  // what stops someone registering a donor's email to claim their ad-free.
  function signUp(email, password) {
    remember(RESET_KEY, null);
    return start().then(function () {
      return client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: here() } });
    }).then(check).then(function (data) {
      // Supabase answers an existing address with an empty identity list
      // rather than an error, so it cannot be used to probe for accounts.
      if (data && data.user && data.user.identities && data.user.identities.length === 0) {
        var err = new Error("already registered");
        err.code = "user_already_exists";
        throw err;
      }
      return data;
    });
  }

  function resendConfirmation(email) {
    return start().then(function () {
      return client.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: here() } });
    }).then(check);
  }

  function sendReset(email) {
    return start().then(function () {
      remember(RESET_KEY, "1");
      return client.auth.resetPasswordForEmail(email, { redirectTo: here() });
    }).then(check);
  }

  function setNewPassword(password) {
    return client.auth.updateUser({ password: password }).then(check);
  }

  // Supabase's messages, in plain words.
  function explain(err) {
    var m = String((err && (err.code || err.message)) || "");
    if (/invalid.?login|invalid_credentials/i.test(m)) return "That email and password don’t match. Try again, or reset your password.";
    if (/not.?confirmed/i.test(m)) return "Please confirm your email first — open the link we sent you.";
    if (/already|user_already_exists/i.test(m)) return "There’s already an account with this email. Sign in instead.";
    if (/weak|short|at least/i.test(m)) return "Please choose a longer password (at least " + MIN_PASSWORD + " characters).";
    if (/rate|limit|seconds|security purposes/i.test(m)) return "Too many emails just now. Please wait a few minutes, or continue with Google.";
    if (/same.?password|different from the old/i.test(m)) return "Your new password must be different from the old one.";
    return "Something went wrong. Please try again, or continue with Google.";
  }

  /* --------------------------------------------------------- dialog ---- */

  var GOOGLE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>' +
    '<path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1C3.4 21.4 7.4 24 12 24z"/>' +
    '<path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5h-4C.5 8.2 0 10 0 12s.5 3.8 1.4 5.5l4-3.1z"/>' +
    '<path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.4 2.6 1.4 6.5l4 3.1c.9-2.8 3.5-4.8 6.6-4.8z"/>' +
    "</svg>";

  // The site's eight-pointed star, as on the favicon.
  var STAR =
    '<svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">' +
    '<g transform="translate(32 32)" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round">' +
    '<rect x="-16" y="-16" width="32" height="32"/><rect x="-16" y="-16" width="32" height="32" transform="rotate(45)"/></g>' +
    '<circle cx="32" cy="32" r="4.5" fill="currentColor"/></svg>';

  var EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

  function field(id, label, type, auto, extra) {
    var input = '<input id="' + id + '" name="' + id + '" type="' + type + '" autocomplete="' + auto + '" required' +
                (extra || "") + ">";
    if (type === "password") {
      input = '<div class="si-pw">' + input +
        '<button type="button" class="si-eye" data-for="' + id + '" aria-label="Show password">' + EYE + "</button></div>";
    }
    return '<label class="si-field"><span>' + label + "</span>" + input + "</label>";
  }

  var GOOGLE_BLOCK =
    '<div class="si-or"><span>or</span></div>' +
    '<button class="si-google" type="button" data-google>' + GOOGLE_ICON + "Continue with Google</button>";

  var VIEWS = {
    signin:
      '<form class="si-form" data-form="signin" novalidate>' +
        field("si-in-email", "Email", "email", "username") +
        field("si-in-pass", "Password", "password", "current-password") +
        '<button type="button" class="si-link si-forgot" data-go="forgot">Forgot password?</button>' +
        '<button class="si-submit" type="submit">Sign in</button>' +
      "</form>" + GOOGLE_BLOCK,

    signup:
      '<form class="si-form" data-form="signup" novalidate>' +
        field("si-up-email", "Email", "email", "email") +
        field("si-up-pass", "Password", "password", "new-password", ' minlength="' + MIN_PASSWORD + '"') +
        '<p class="si-hint">At least ' + MIN_PASSWORD + " characters.</p>" +
        '<button class="si-submit" type="submit">Create account</button>' +
      "</form>" + GOOGLE_BLOCK,

    forgot:
      '<p class="si-lead">Enter your email and we’ll send you a link to choose a new password.</p>' +
      '<form class="si-form" data-form="forgot" novalidate>' +
        field("si-fg-email", "Email", "email", "email") +
        '<button class="si-submit" type="submit">Send reset link</button>' +
      "</form>" +
      '<button type="button" class="si-link si-back" data-go="signin">← Back to sign in</button>',

    reset:
      '<p class="si-lead">Choose a new password for your account.</p>' +
      '<form class="si-form" data-form="reset" novalidate>' +
        field("si-rs-pass", "New password", "password", "new-password", ' minlength="' + MIN_PASSWORD + '"') +
        '<p class="si-hint">At least ' + MIN_PASSWORD + " characters.</p>" +
        '<button class="si-submit" type="submit">Save new password</button>' +
      "</form>",

    sent:
      '<div class="si-sent">' +
        '<div class="si-mail" aria-hidden="true">✉</div>' +
        '<p class="si-lead" id="si-sent-text"></p>' +
        '<button type="button" class="si-link" id="si-resend" hidden>Resend the email</button>' +
        '<button type="button" class="si-link si-back" data-go="signin">← Back to sign in</button>' +
      "</div>"
  };

  var TITLES = {
    signin: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "New password",
    sent: "Check your email"
  };

  var state = { view: "signin", why: "", codeLink: false, email: "" };

  function el(id) { return d.getElementById(id); }
  function q(sel) { return el("modal-signin").querySelector(sel); }

  function injectDialog() {
    var box = d.createElement("div");
    box.className = "modal si-modal";
    box.id = "modal-signin";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "si-title");
    box.innerHTML =
      '<div class="box signin">' +
        '<button class="si-x" type="button" id="si-close" aria-label="Close">×</button>' +
        '<div class="si-head">' +
          '<div class="si-star">' + STAR + "</div>" +
          '<h2 id="si-title">Welcome back</h2>' +
          '<p class="si-why" id="si-why"></p>' +
        "</div>" +
        '<div class="si-tabs" role="tablist" id="si-tabs">' +
          '<button type="button" role="tab" data-go="signin">Sign in</button>' +
          '<button type="button" role="tab" data-go="signup">Create account</button>' +
        "</div>" +
        '<div id="si-body"></div>' +
        '<p class="si-status" id="si-status" role="alert"></p>' +
        '<button class="si-link si-code" type="button" id="si-code" hidden>Rather not sign in? Use a supporter code</button>' +
      "</div>";
    d.body.appendChild(box);

    el("si-close").onclick = closeDialog;
    box.addEventListener("mousedown", function (e) { if (e.target === box) closeDialog(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) closeDialog(); });

    // One delegated handler for every button in every view.
    box.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t || !box.contains(t)) return;
      if (t.dataset.go) { show(t.dataset.go); return; }
      if (t.hasAttribute("data-google")) {
        status("Opening Google…");
        signInGoogle().catch(function () { status("Google sign-in isn’t available right now.", "bad"); });
        return;
      }
      if (t.classList.contains("si-eye")) {
        var input = el(t.dataset.for);
        var shown = input.type === "text";
        input.type = shown ? "password" : "text";
        t.setAttribute("aria-label", shown ? "Show password" : "Hide password");
        t.classList.toggle("on", !shown);
        return;
      }
      if (t.id === "si-resend") {
        t.disabled = true;
        resendConfirmation(state.email).then(function () {
          status("Sent again. It can take a minute to arrive.", "ok");
        }, function (err) { status(explain(err), "bad"); }).then(function () { t.disabled = false; });
        return;
      }
      if (t.id === "si-code") {
        closeDialog();
        remember(NEXT_KEY, null);
        if (w.IslamdleSupport) w.IslamdleSupport.open(null, { code: true });
      }
    });

    box.addEventListener("submit", function (e) {
      e.preventDefault();
      submit(e.target);
    });
  }

  function show(view) {
    state.view = view;
    el("si-title").textContent = TITLES[view];
    var tabs = view === "signin" || view === "signup";
    el("si-tabs").hidden = !tabs;
    el("si-why").hidden = !tabs || !state.why;
    Array.prototype.forEach.call(el("si-tabs").children, function (b) {
      var on = b.dataset.go === view;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    el("si-body").innerHTML = VIEWS[view];
    el("si-code").hidden = !(state.codeLink && tabs);
    status("");
    // Carry a typed email between sign in, create account and forgot.
    var email = q('input[type="email"]');
    if (email && state.email) email.value = state.email;
    var first = q("input");
    if (first) setTimeout(function () { (email && state.email ? q('input[type="password"]') || email : first).focus(); }, 30);
  }

  function sent(text, canResend) {
    show("sent");
    el("si-sent-text").innerHTML = text;
    el("si-resend").hidden = !canResend;
  }

  function busy(form, on, label) {
    var b = form.querySelector(".si-submit");
    if (on) { b.dataset.label = b.textContent; b.textContent = label; }
    else if (b.dataset.label) b.textContent = b.dataset.label;
    b.disabled = on;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function submit(form) {
    var kind = form.dataset.form;
    var emailInput = form.querySelector('input[type="email"]');
    var passInput = form.querySelector('input[name$="pass"]');
    var email = emailInput ? emailInput.value.trim() : "";
    var pass = passInput ? passInput.value : "";

    if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status("Please enter a valid email address.", "bad"); emailInput.focus(); return; }
    if (passInput && !pass) { status("Please enter your password.", "bad"); passInput.focus(); return; }
    if (passInput && kind !== "signin" && pass.length < MIN_PASSWORD) {
      status("Please choose a longer password (at least " + MIN_PASSWORD + " characters).", "bad");
      passInput.focus();
      return;
    }
    if (email) state.email = email;
    status("");

    if (kind === "signin") {
      busy(form, true, "Signing in…");
      signInPassword(email, pass).then(function () { /* onAuthStateChange closes the dialog */ }, function (err) {
        busy(form, false);
        status(explain(err), "bad");
        if (/not.?confirmed/i.test(String(err && (err.code || err.message)))) {
          sent("Please confirm <b>" + esc(email) + "</b> first. Open the link we sent you, on this device.", true);
        }
      });
    } else if (kind === "signup") {
      busy(form, true, "Creating account…");
      signUp(email, pass).then(function (data) {
        if (data && data.session) return;   // confirmation switched off in Supabase
        sent("We sent a confirmation link to <b>" + esc(email) + "</b>. Open it <b>on this device</b> and you’ll be signed in.", true);
      }, function (err) {
        busy(form, false);
        status(explain(err), "bad");
      });
    } else if (kind === "forgot") {
      busy(form, true, "Sending…");
      sendReset(email).then(function () {
        sent("If there’s an account for <b>" + esc(email) + "</b>, we’ve sent a link to choose a new password. Open it on this device.", false);
      }, function (err) {
        busy(form, false);
        status(explain(err), "bad");
      });
    } else if (kind === "reset") {
      busy(form, true, "Saving…");
      setNewPassword(pass).then(function () {
        el("si-title").textContent = "Password changed";
        el("si-body").innerHTML = '<p class="si-lead">You’re signed in with your new password.</p>' +
          '<button class="si-submit" type="button" id="si-done">Continue</button>';
        el("si-done").onclick = closeDialog;
        state.view = "done";
      }, function (err) {
        busy(form, false);
        status(explain(err), "bad");
      });
    }
  }

  function status(text, kind) {
    var s = el("si-status");
    if (!s) return;
    s.textContent = text;
    s.className = "si-status" + (kind ? " " + kind : "");
  }

  // opts: { title, why, next: "support", codeLink: bool, view: "signup" }
  function openDialog(opts) {
    opts = opts || {};
    if (!el("modal-signin")) injectDialog();
    state.why = opts.why || "Keep your streak on every device. If you’ve donated, ads switch off by themselves.";
    state.codeLink = !!opts.codeLink;
    el("si-why").textContent = state.why;
    remember(NEXT_KEY, opts.next || null);
    show(opts.view || "signin");
    if (opts.title && (opts.view || "signin") === "signin") el("si-title").textContent = opts.title;
    el("modal-signin").hidden = false;
    start().catch(function () { /* the buttons report it */ });
  }

  function closeDialog() {
    var box = el("modal-signin");
    if (box) box.hidden = true;
  }

  // Back from a password-reset email: ask for the new password.
  function recovering() {
    take(RESET_KEY);
    if (!el("modal-signin")) injectDialog();
    state.codeLink = false;
    show("reset");
    el("modal-signin").hidden = false;
  }

  // Signed in (maybe in another tab, from an email link): close the dialog
  // and carry on with what the visitor was doing.
  listeners.push(function (u) {
    if (!u) return;
    if (take(RESET_KEY)) { recovering(); return; }
    if (state.view !== "reset") closeDialog();
    if (take(NEXT_KEY) === "support" && w.IslamdleSupport) w.IslamdleSupport.open();
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
