// Progressive enhancement. Hero + mock animate via CSS on load (robust, no
// scroll gating). JS handles: below-the-fold reveals, the mock's finish/replay,
// and copy buttons. No-JS shows everything; reduced-motion shows finished states.
(() => {
  document.documentElement.classList.add("js");

  // Below-the-fold staggered reveal
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        if (e.target.dataset.i) e.target.style.transitionDelay = parseInt(e.target.dataset.i, 10) * 70 + "ms";
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    },
    { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // Live-Activity mock: JS drives the fill width + the % counter so the number
  // actually counts up (an animated CSS counter() doesn't render in Safari or
  // Firefox — it would jump 0 -> Done). Easing holds a constant rate up to 80%,
  // then decelerates into the finish. Replays on click.
  const mock = document.getElementById("mock");
  if (mock) {
    const fill = mock.querySelector(".la-fill");
    const pct = mock.querySelector(".pct");
    const ring = document.querySelector(".ring"); // outer ring tracks the same progress
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const DURATION = 3400;
    let raf = 0;

    // constant velocity until value 0.8, then ease-out to 1.0 (continuous at the seam)
    const ease = (t) => {
      const split = 0.55; // fraction of the time spent reaching 80%
      if (t < split) return (0.8 / split) * t;
      const u = (t - split) / (1 - split);
      return 0.8 + 0.2 * (1 - (1 - u) * (1 - u));
    };

    // keep the ring sweep locked to the bar's fill value
    const setRing = (v, done) => {
      if (!ring) return;
      ring.style.setProperty("--p", (v * 360).toFixed(1) + "deg");
      ring.classList.toggle("full", !!done);
    };

    function play() {
      cancelAnimationFrame(raf);
      if (reduce.matches) { mock.classList.add("done"); setRing(1, true); return; } // CSS shows finished state
      mock.classList.remove("done");
      setRing(0, false);
      let start = 0;
      const step = (ts) => {
        if (!start) start = ts;
        const t = Math.min((ts - start) / DURATION, 1);
        const v = ease(t);
        fill.style.width = v * 100 + "%";
        pct.textContent = Math.round(v * 100) + "%";
        setRing(v, false);
        if (t < 1) raf = requestAnimationFrame(step);
        else { mock.classList.add("done"); setRing(1, true); }
      };
      raf = requestAnimationFrame(step);
    }

    play();
    mock.addEventListener("click", play);
  }

  // Waitlist forms: post the email to the configured endpoint and confirm inline.
  // Until [WAITLIST_ENDPOINT] is replaced with a real form URL (Formspree, Tally,
  // Buttondown, …), we show a friendly "opening soon" note instead of erroring.
  function wireWaitlist(form) {
    const input = form.querySelector('input[type="email"]');
    const msg = document.createElement("p");
    msg.className = "waitlist-msg";
    form.insertAdjacentElement("afterend", msg);

    const show = (text, isErr) => {
      msg.textContent = text;
      msg.classList.toggle("err", !!isErr);
      msg.classList.add("show");
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = (input.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { show("Enter a valid email.", true); return; }

      const endpoint = form.getAttribute("action") || "";
      if (endpoint.includes("[")) {            // placeholder not yet wired
        form.classList.add("done");
        show("Thanks! The waitlist opens shortly — check back soon.");
        return;
      }
      show("Joining…");
      fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      })
        .then((r) => {
          if (!r.ok) throw new Error("bad status");
          form.classList.add("done");
          show("You're on the list ✓ We'll email you when Glance is live.");
        })
        .catch(() => show("Something went wrong — try again in a moment.", true));
    });
  }
  document.querySelectorAll("form.waitlist").forEach(wireWaitlist);
})();
