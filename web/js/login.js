// catnet — by cole (github.com/yupthatscole)
"use strict";
(function () {
  const { $ } = cn;
  const tuft = new cn.Tuft($("#tuft"), 2);
  const say = $("#say");
  const form = $("#form"), user = $("#user"), pass = $("#pass"), key = $("#key"), err = $("#err"), go = $("#go");
  let mode = "login", setupMode = false, lockTimer = 0, busy = false;

  function speak(text, mood, hold) {
    say.textContent = text;
    say.style.animation = "none";
    void say.offsetWidth;
    say.style.animation = "";
    tuft.play(mood || "idle", hold);
  }

  function setMode(m) {
    mode = m;
    const join = m === "join";
    $("#tabLogin").classList.toggle("on", !join);
    $("#tabJoin").classList.toggle("on", join);
    $("#tabLogin").setAttribute("aria-selected", !join);
    $("#tabJoin").setAttribute("aria-selected", join);
    $("#keyField").hidden = !join || (!setupMode && state.open);
    $("#joinHint").hidden = !join;
    pass.autocomplete = join ? "new-password" : "current-password";
    go.textContent = join ? (setupMode ? "create admin account →" : "join catnet →") : "enter catnet →";
    err.textContent = "";
    speak(join ? "a new cat? pick a name. i'll remember it. probably." : "tuft is guarding the portal.", join ? "curious" : "idle");
  }

  function lockout(seconds) {
    clearInterval(lockTimer);
    let left = seconds;
    go.disabled = true;
    const tick = () => {
      err.textContent = `too many attempts. try again in ${left}s. or don't, i probably hate you if you don't have the password.`;
      if (left-- <= 0) {
        clearInterval(lockTimer);
        go.disabled = false;
        err.textContent = "";
        speak("ok. calm. try again.", "idle");
      }
    };
    speak("stop guessing the password bro.", "surprised");
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  user.addEventListener("focus", () => speak(mode === "join" ? "ooh, what's your name going to be?" : "who goes there?", "curious"));
  pass.addEventListener("focus", () => speak("eyes closed. promise.", "sleep"));
  key.addEventListener("focus", () => speak("the secret handshake. go on.", "sleep"));
  for (const el of [user, pass, key]) el.addEventListener("blur", () => { if (!busy) tuft.play("idle"); });
  user.addEventListener("input", () => { user.value = user.value.toLowerCase().replace(/\s/g, ""); });

  $("#tabLogin").addEventListener("click", () => setMode("login"));
  $("#tabJoin").addEventListener("click", () => setMode("join"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || go.disabled) return;
    err.textContent = "";
    if (!user.value || !pass.value) {
      err.textContent = "fill in both fields.";
      speak("you forgot a bit.", "confused", 1800);
      return;
    }
    busy = true;
    go.disabled = true;
    speak(mode === "join" ? "making you a cat bed…" : "checking your whiskers…", "think");
    try {
      const body = { user: user.value, pass: pass.value, t: Date.now() };
      if (mode === "join") body.key = key.value;
      const me = await cn.api(mode === "join" ? "/api/register" : "/api/login", body, { quiet401: true });
      speak(mode === "join" ? `welcome to catnet, ${me.user.n}!` : `welcome back, ${me.user.n}!`, "happy");
      cn.applyPrefs(me.accent, me.prefs);
      setTimeout(() => { location.href = cn.safeNext(cn.params.get("next")); }, 650);
    } catch (ex) {
      busy = false;
      go.disabled = false;
      if (ex.status === 429 && ex.data && ex.data.wait) return lockout(ex.data.wait);
      err.textContent = ex.status === 0 ? "can't reach catnet. are you on its wi-fi?" : ex.message.replace(/\.$/, "") + ".";
      if (ex.status === 401 && mode === "join") key.select();
      else if (ex.status === 401) { pass.value = ""; pass.focus(); }
      speak(ex.status === 401 ? (mode === "join" ? "that's not the secret handshake." : "tuft does not recognize you.") : "hm. that didn't work.", "confused");
      form.classList.remove("shake");
      void form.offsetWidth;
      form.classList.add("shake");
    }
  });

  let state = { open: false };
  cn.api("/api/state", undefined, { quiet401: true }).then((s) => {
    state = s;
    if (s.in) { location.href = cn.safeNext(cn.params.get("next")); return; }
    if (s.motd) { $("#motd").textContent = s.motd; $("#motd").hidden = false; }
    if (s.setup) {
      setupMode = true;
      $("#setup").hidden = false;
      $(".tabs").hidden = true;
      setMode("join");
      speak("first boot! nobody lives here yet. you can be the boss.", "surprised", 2400);
    } else if (cn.params.has("bye")) {
      speak("bye. i'll keep the seat warm.", "sleep");
    }
    if (s.wait) lockout(s.wait);
  }).catch(() => {
    err.textContent = "can't reach catnet. are you on its wi-fi?";
    speak("…hello? is anyone there?", "confused");
  });
})();
