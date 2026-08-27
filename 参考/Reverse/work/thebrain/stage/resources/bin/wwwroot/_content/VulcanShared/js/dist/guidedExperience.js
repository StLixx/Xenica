class GuidedExperience {
    constructor() {
        this.resizeObserverId = 0;
        this.resizeCallbacks = new Map();
        this.resizeObserver = null;
        this.scrollHandler = null;
        this.targetObserver = null;
    }
    getElementRect(selectorOrId) {
        const element = this.findElement(selectorOrId);
        if (!element)
            return null;
        const rect = element.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        };
    }
    scrollIntoView(selectorOrId) {
        const element = this.findElement(selectorOrId);
        if (!element)
            return false;
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        return true;
    }
    addHighlightClass(selectorOrId, className) {
        const element = this.findElement(selectorOrId);
        if (!element)
            return false;
        element.classList.add(className);
        return true;
    }
    removeHighlightClass(selectorOrId, className) {
        const element = this.findElement(selectorOrId);
        if (!element)
            return false;
        element.classList.remove(className);
        return true;
    }
    observeResize(dotNetRef, methodName) {
        const id = ++this.resizeObserverId;
        this.resizeCallbacks.set(id, { dotNetRef, methodName });
        if (!this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.notifyAllResizeCallbacks();
            });
            this.resizeObserver.observe(document.body);
        }
        if (!this.scrollHandler) {
            this.scrollHandler = () => this.notifyAllResizeCallbacks();
            window.addEventListener('scroll', this.scrollHandler, true);
            window.addEventListener('resize', this.scrollHandler);
        }
        return id;
    }
    removeResizeObserver(id) {
        this.resizeCallbacks.delete(id);
        if (this.resizeCallbacks.size === 0) {
            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
            }
            if (this.scrollHandler) {
                window.removeEventListener('scroll', this.scrollHandler, true);
                window.removeEventListener('resize', this.scrollHandler);
                this.scrollHandler = null;
            }
        }
    }
    notifyAllResizeCallbacks() {
        this.resizeCallbacks.forEach((callback) => {
            try {
                callback.dotNetRef.invokeMethodAsync(callback.methodName);
            }
            catch (_a) {
            }
        });
    }
    observeTargetElement(selectorOrId, dotNetRef, methodName) {
        this.unobserveTargetElement();
        const el = this.findElement(selectorOrId);
        if (!el)
            return;
        this.targetObserver = new ResizeObserver(() => {
            try {
                dotNetRef.invokeMethodAsync(methodName);
            }
            catch (_a) { }
        });
        this.targetObserver.observe(el);
    }
    unobserveTargetElement() {
        if (this.targetObserver) {
            this.targetObserver.disconnect();
            this.targetObserver = null;
        }
    }
    fireConfetti() {
        document.querySelectorAll('canvas[data-guided-confetti]').forEach(el => el.remove());
        const canvas = document.createElement('canvas');
        canvas.setAttribute('data-guided-confetti', '');
        canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:58;';
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            canvas.remove();
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        let W = window.innerWidth;
        let H = window.innerHeight;
        const resize = () => {
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = Math.floor(W * dpr);
            canvas.height = Math.floor(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener('resize', resize);
        const palette = [
            '#0a1530',
            '#143280',
            '#1d4ed8',
            '#6595f0',
            '#c3d8f7',
            '#ffffff',
        ];
        const pickColor = () => palette[Math.floor(Math.random() * palette.length)];
        const ringColorA = '#1d4ed8';
        const ringColorB = '#6595f0';
        const flashRgb = '29, 78, 216';
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const startedAt = performance.now();
            const duration = 700;
            const step = (now) => {
                const t = (now - startedAt) / duration;
                if (t >= 1) {
                    window.removeEventListener('resize', resize);
                    canvas.remove();
                    return;
                }
                ctx.clearRect(0, 0, W, H);
                const alpha = Math.sin(t * Math.PI) * 0.22;
                const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
                grad.addColorStop(0, `rgba(${flashRgb}, ${alpha})`);
                grad.addColorStop(1, `rgba(${flashRgb}, 0)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, W, H);
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            return;
        }
        const particles = [];
        const spawnConfetti = (x, y, angle, spread, speedMin, speedMax, count) => {
            for (let i = 0; i < count; i++) {
                const a = angle + (Math.random() - 0.5) * spread;
                const speed = speedMin + Math.random() * (speedMax - speedMin);
                const roll = Math.random();
                const shape = roll < 0.15 ? 'streamer' : (roll < 0.25 ? 'logo' : (Math.random() > 0.4 ? 'rect' : 'circle'));
                const isStreamer = shape === 'streamer';
                const isLogo = shape === 'logo';
                particles.push({
                    x, y,
                    vx: Math.cos(a) * speed,
                    vy: Math.sin(a) * speed,
                    rot: Math.random() * Math.PI * 2,
                    vrot: (Math.random() - 0.5) * 0.55,
                    w: isStreamer ? 28 + Math.random() * 38 : (isLogo ? 13 + Math.random() * 9 : 5 + Math.random() * 8),
                    h: isStreamer ? 3 + Math.random() * 2 : (isLogo ? 13 + Math.random() * 9 : 7 + Math.random() * 9),
                    color: pickColor(),
                    shape,
                    born: performance.now(),
                    lifetime: 3200 + Math.random() * 2200,
                    gravity: isStreamer ? 0.12 + Math.random() * 0.06 : 0.26 + Math.random() * 0.14,
                    drag: isStreamer ? 0.995 : 0.991,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 0.06 + Math.random() * 0.09,
                });
            }
        };
        const spawnRing = (x, y, color) => {
            particles.push({
                x, y, vx: 0, vy: 0, rot: 0, vrot: 0,
                w: 10, h: 10,
                color, shape: 'ring',
                born: performance.now(), lifetime: 650,
                gravity: 0, drag: 1,
                wobble: 0, wobbleSpeed: 0,
                startScale: 0.4, endScale: 48,
            });
        };
        const spawnSparkles = (x, y, count, radius) => {
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * radius;
                particles.push({
                    x: x + Math.cos(a) * r,
                    y: y + Math.sin(a) * r,
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: -0.2 - Math.random() * 0.5,
                    rot: 0,
                    vrot: 0.04 + Math.random() * 0.04,
                    w: 5 + Math.random() * 7,
                    h: 5 + Math.random() * 7,
                    color: pickColor(),
                    shape: 'sparkle',
                    born: performance.now(),
                    lifetime: 700 + Math.random() * 800,
                    gravity: 0, drag: 0.985,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 0.14 + Math.random() * 0.08,
                });
            }
        };
        spawnConfetti(W * 0.04, H * 0.96, -Math.PI / 3, Math.PI * 0.55, 15, 26, 55);
        spawnConfetti(W * 0.96, H * 0.96, -Math.PI + Math.PI / 3, Math.PI * 0.55, 15, 26, 55);
        spawnRing(W * 0.22, H * 0.5, ringColorA);
        spawnSparkles(W * 0.25, H * 0.45, 12, 65);
        spawnSparkles(W * 0.75, H * 0.45, 12, 65);
        const timeouts = [];
        const after = (ms, fn) => { timeouts.push(window.setTimeout(fn, ms)); };
        after(280, () => {
            for (let i = 0; i < 32; i++) {
                spawnConfetti(Math.random() * W, -20, Math.PI / 2, Math.PI * 0.25, 3, 7, 1);
            }
            spawnConfetti(W * 0.2, H * 0.45, -Math.PI / 2, Math.PI * 2, 6, 14, 18);
            spawnConfetti(W * 0.8, H * 0.45, -Math.PI / 2, Math.PI * 2, 6, 14, 18);
            spawnRing(W * 0.78, H * 0.5, ringColorB);
        });
        after(1100, () => {
            const onLeft = Math.random() < 0.5;
            const x = onLeft ? W * (0.08 + Math.random() * 0.18) : W * (0.74 + Math.random() * 0.18);
            const y = H * (0.3 + Math.random() * 0.35);
            spawnConfetti(x, y, -Math.PI / 2, Math.PI * 2, 5, 12, 22);
            spawnSparkles(x, y, 10, 45);
            spawnRing(x, y, palette[Math.floor(Math.random() * palette.length)]);
        });
        after(1900, () => {
            for (let i = 0; i < 22; i++) {
                spawnConfetti(Math.random() * W, -20, Math.PI / 2, Math.PI * 0.3, 2, 5, 1);
            }
        });
        const startedAt = performance.now();
        const totalDuration = 4500;
        let raf = 0;
        const brainLogoPath = new Path2D('M55.182,80C55.182,91.414 45.915,100.682 34.501,100.682L26.228,100.682C14.814,100.682 5.546,91.414 5.546,80C5.546,68.586 14.814,59.318 26.228,59.318L34.501,59.318C45.915,59.318 55.182,68.586 55.182,80ZM75.864,59.318C64.449,59.318 55.182,50.051 55.182,38.637C55.182,27.222 64.449,17.955 75.864,17.955L84.136,17.955C95.551,17.955 104.818,27.222 104.818,38.637C104.818,50.051 114.085,59.318 125.499,59.318L133.772,59.318C145.186,59.318 154.454,68.586 154.454,80C154.454,91.414 145.186,100.682 133.772,100.682L125.499,100.682C114.085,100.682 104.818,109.949 104.818,121.363C104.818,132.778 95.551,142.045 84.136,142.045L75.864,142.045C64.449,142.045 55.182,132.778 55.182,121.363C55.182,109.949 64.449,100.682 75.864,100.682L84.136,100.682C95.551,100.682 104.818,91.414 104.818,80C104.818,68.586 95.551,59.318 84.136,59.318L75.864,59.318Z');
        const drawBrainLogo = (halfSize) => {
            const scale = halfSize / 80;
            ctx.scale(scale, scale);
            ctx.translate(-80, -80);
            ctx.lineWidth = 2 / scale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.stroke(brainLogoPath);
        };
        const drawSparkle = (size) => {
            ctx.beginPath();
            ctx.moveTo(0, -size);
            ctx.lineTo(size * 0.22, 0);
            ctx.lineTo(0, size);
            ctx.lineTo(-size * 0.22, 0);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-size, 0);
            ctx.lineTo(0, size * 0.22);
            ctx.lineTo(size, 0);
            ctx.lineTo(0, -size * 0.22);
            ctx.closePath();
            ctx.fill();
        };
        const step = (now) => {
            const elapsed = now - startedAt;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            try {
                for (const p of particles) {
                    const age = now - p.born;
                    if (age > p.lifetime)
                        continue;
                    const lifeT = age / p.lifetime;
                    const alpha = 1 - Math.pow(lifeT, 2.4);
                    if (alpha <= 0)
                        continue;
                    p.vy += p.gravity;
                    p.vx *= p.drag;
                    p.vy *= p.drag;
                    if (p.shape === 'streamer') {
                        p.wobble += p.wobbleSpeed;
                        p.x += p.vx + Math.sin(p.wobble) * 1.6;
                        p.y += p.vy;
                        p.rot += p.vrot * 0.35 + Math.sin(p.wobble * 0.5) * 0.06;
                    }
                    else {
                        p.x += p.vx;
                        p.y += p.vy;
                        p.rot += p.vrot;
                    }
                    if (p.y > H + 60)
                        continue;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(p.x, p.y);
                    if (p.shape === 'ring') {
                        const t = age / p.lifetime;
                        const scale = (p.startScale || 1) + ((p.endScale || 1) - (p.startScale || 1)) * t;
                        ctx.strokeStyle = p.color;
                        ctx.lineWidth = 4 * (1 - t);
                        ctx.beginPath();
                        ctx.arc(0, 0, scale * 10, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    else if (p.shape === 'sparkle') {
                        p.wobble += p.wobbleSpeed;
                        const pulse = 0.65 + Math.sin(p.wobble) * 0.35;
                        ctx.fillStyle = p.color;
                        ctx.shadowColor = p.color;
                        ctx.shadowBlur = 14;
                        drawSparkle(p.w * pulse);
                    }
                    else if (p.shape === 'logo') {
                        ctx.rotate(p.rot);
                        ctx.strokeStyle = p.color;
                        drawBrainLogo(p.w);
                    }
                    else if (p.shape === 'streamer') {
                        ctx.rotate(p.rot);
                        ctx.fillStyle = p.color;
                        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    }
                    else if (p.shape === 'circle') {
                        ctx.fillStyle = p.color;
                        ctx.beginPath();
                        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    else {
                        ctx.rotate(p.rot);
                        const scaleX = Math.cos(p.rot * 1.3);
                        ctx.scale(Math.abs(scaleX) * 0.85 + 0.15, 1);
                        ctx.fillStyle = p.color;
                        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    }
                    ctx.restore();
                }
            }
            catch (_a) { }
            if (elapsed < totalDuration) {
                raf = requestAnimationFrame(step);
            }
            else {
                for (const id of timeouts)
                    clearTimeout(id);
                window.removeEventListener('resize', resize);
                canvas.remove();
            }
        };
        raf = requestAnimationFrame(step);
    }
    findElement(selectorOrId) {
        if (!selectorOrId)
            return null;
        let element = document.getElementById(selectorOrId);
        if (element)
            return element;
        try {
            element = document.querySelector(selectorOrId);
        }
        catch (_a) {
        }
        return element;
    }
}
export const guidedExperience = new GuidedExperience();
//# sourceMappingURL=guidedExperience.js.map