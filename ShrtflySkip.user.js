// ==UserScript==
// @name         Shrtfly Skip
// @namespace    https://github.com/LetMeInnnnn
// @version      7.0
// @description  กดปุ่มตามลำดับของหน้า AdLink อัตโนมัติ (เริ่ม → ยืนยัน → ไปต่อ) + ซ่อนแบนเนอร์โฆษณา
// @author       naLeei, ChatGPT
// @homepageURL  https://github.com/LetMeInnnnn/Shrtfly-Skip
//
// @match        https://loan.*.net/*
// @match        https://techetta.digital/*
// @match        https://srtslug.biz/*
// @match        https://achivas.life/*
// @match        https://napmap.life/*
// @match        https://dailyjobposting.xyz/*
// @match        https://technons.com/*
// @match        https://tournguide.com/*
// @match        https://financefernly.com/*
//
// @icon         https://preview.redd.it/jbcj0uqbihg41.jpg?width=1080&crop=smart&auto=webp&s=7a529d0abe43ab1f3594f59724b2d9072b6ab56b
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__adskipLoaded) return;
    window.__adskipLoaded = true;

    // ============================================
    // ⚙️ ตั้งค่า (หน่วย: มิลลิวินาที)
    // ============================================
    const CONFIG = {
        startDelay: 100,          // หน่วงก่อนกดปุ่ม "เริ่ม"
        verifyDelay: 100,         // หน่วงก่อนกดปุ่ม "ยืนยัน" หลังตัวนับของเว็บเสร็จ
        nextDelay: 100,          // หน่วงก่อนกดปุ่ม "ไปต่อ"
        startAreaTimeout: 15000,  // รอให้หน้าตัวนับแสดงหลังกดเริ่ม
        countdownTimeout: 60000,  // รอตัวนับของเว็บ (ปกติ ~10 วิ)
        verifyTimeout: 30000,     // รอเซิร์ฟเวอร์ตอบหลังกดยืนยัน
        hideAds: true             // ซ่อนแบนเนอร์โฆษณา (ถ้าเว็บขึ้นหน้า "ปิดตัวบล็อกโฆษณา" ให้ตั้งเป็น false)
    };

    const state = {
        stopped: false,
        timers: new Set(),
        logBox: null,
        stopBtn: null
    };

    const STOP = new Error('stopped');

    // ============================================
    // 🧰 Helpers
    // ============================================
    const byId = id => document.getElementById(id);
    const isHidden = el => !el || el.classList.contains('hidden');
    const tabNote = () => (document.hidden ? ' ⏸ กลับมาที่แท็บนี้เพื่อให้ตัวนับเดินต่อ' : '');

    function sleep(ms) {
        return new Promise(resolve => {
            const t = setTimeout(() => {
                state.timers.delete(t);
                resolve();
            }, ms);
            state.timers.add(t);
        });
    }

    // รอจนกว่า check() จะคืนค่าจริง (poll ทุก 250ms)
    async function waitFor(check, { timeout = 30000, interval = 250, onTick, label = '' } = {}) {
        const t0 = Date.now();
        for (;;) {
            if (state.stopped) throw STOP;
            const value = check();
            if (value) return value;
            if (Date.now() - t0 > timeout) {
                throw new Error('หมดเวลารอ' + (label ? ': ' + label : ''));
            }
            if (onTick) onTick(Date.now() - t0);
            await sleep(interval);
        }
    }

    // ============================================
    // 🎨 UI: CSS / Log / ปุ่มหยุด
    // ============================================
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #adskip-log-box {
                position: fixed;
                bottom: 70px;
                right: 20px;
                max-width: 300px;
                background: rgba(0, 0, 0, 0.9);
                color: #00ff00;
                padding: 12px 15px;
                border-radius: 10px;
                font-size: 13px;
                line-height: 1.5em;
                z-index: 2147483000;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.7);
                font-family: 'Consolas', 'Monaco', monospace;
                opacity: 0.92;
                border: 1px solid rgba(0, 255, 0, 0.3);
            }
            #adskip-stop-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 10px 18px;
                z-index: 2147483000;
                background: linear-gradient(135deg, #d33 0%, #a11 100%);
                color: #fff;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 3px 12px rgba(0, 0, 0, 0.6);
                font-size: 14px;
                font-weight: 600;
                opacity: 0.9;
            }
            #adskip-stop-btn:hover { opacity: 1; }
            ${CONFIG.hideAds ? `
            /* แบนเนอร์ข้างหน้าจอ + กล่องโฆษณา netpub */
            .shrtflyb .sticky.lg\\:block,
            ins[class^="adv-"] { display: none !important; }
            ` : ''}
        `;
        document.head.appendChild(style);
    }

    function createLogBox() {
        const box = document.createElement('div');
        box.id = 'adskip-log-box';
        box.textContent = '📢 AdSkip พร้อมทำงาน...';
        document.body.appendChild(box);
        state.logBox = box;
        return box;
    }

    function log(message, isError = false) {
        try {
            const box = state.logBox && state.logBox.isConnected ? state.logBox : createLogBox();
            box.textContent = message;
            box.style.color = isError ? '#ff5555' : '#00ff00';
            console.log('[AdSkip] ' + message);
        } catch (e) { /* หน้าอาจถูกแทนที่ระหว่าง redirect */ }
    }

    function removeStopButton() {
        if (state.stopBtn) {
            state.stopBtn.remove();
            state.stopBtn = null;
        }
    }

    function createStopButton() {
        const btn = document.createElement('button');
        btn.id = 'adskip-stop-btn';
        btn.type = 'button';
        btn.textContent = '⏹ หยุดสคริปต์';
        btn.title = 'กดเพื่อหยุด (ต้องรีโหลดเพื่อเริ่มใหม่)';
        btn.addEventListener('click', stopScript);
        document.body.appendChild(btn);
        state.stopBtn = btn;
    }

    function stopScript() {
        log('🛑 สคริปต์ถูกหยุด (รีโหลดเพื่อเริ่มใหม่)');
        state.stopped = true;
        state.timers.forEach(t => clearTimeout(t));
        state.timers.clear();
        removeStopButton();
    }

    // ============================================
    // 🔍 หา element ของหน้า
    // ============================================
    // โครงสร้างหน้า (prefix ของ id สุ่มทุกหน้า):
    //   {code}_start_area  → ปุ่ม {code}_start        (ปุ่ม 1 "เริ่ม")
    //   {code}_area        → form#{code} + ตัวนับ 10 วิ → ปุ่ม submit (ปุ่ม 2 "ยืนยัน")
    //   {code}_final       → form ที่มี speed_token    (ปุ่ม 3 "ไปต่อ")
    function findElements() {
        const startArea = document.querySelector('[id$="_start_area"]');
        if (!startArea) return null;

        const code = startArea.id.replace(/_start_area$/, '');
        return {
            code,
            startArea,
            startBtn: byId(code + '_start'),
            area: byId(code + '_area'),
            form: byId(code),
            final: byId(code + '_final')
        };
    }

    // ============================================
    // 🚀 ลำดับการทำงานหลัก
    // ============================================
    async function run(els) {
        if (!els.startBtn || !els.area || !els.form || !els.final) {
            log('❌ โครงสร้างหน้าไม่ตรงกับที่สคริปต์รู้จัก', true);
            removeStopButton();
            return;
        }

        try {
            // ---------- ปุ่ม 1: เริ่ม ----------
            await sleep(CONFIG.startDelay);

            if (!isHidden(els.startArea)) {
                log('① กดปุ่ม "เริ่ม"');
                els.startBtn.click();
            }

            // เว็บจะนับถอยหลัง ~2 วิ แล้วสลับไปแสดงหน้า {code}_area เอง
            await waitFor(() => !isHidden(els.area), {
                timeout: CONFIG.startAreaTimeout,
                label: 'หน้าตัวนับไม่แสดง',
                onTick: () => {
                    const t = els.startBtn.querySelector('.btn-text');
                    log('① กำลังเริ่ม… ' + (t ? t.textContent.trim() : '') + tabNote());
                }
            });

            // ---------- ปุ่ม 2: ยืนยัน (รอตัวนับของเว็บ ~10 วิ) ----------
            const verifyBtn = els.form.querySelector('button[type="submit"]');
            const counterEl = byId('countdown-number');

            const readyToVerify = () =>
                verifyBtn &&
                !verifyBtn.disabled &&
                !verifyBtn.classList.contains('loading') &&
                (!counterEl || counterEl.classList.contains('done'));

            await waitFor(readyToVerify, {
                timeout: CONFIG.countdownTimeout,
                label: 'ตัวนับไม่จบ',
                onTick: () => {
                    const n = counterEl ? counterEl.textContent.trim() : '';
                    log('② รอตัวนับของเว็บ… ' + (n ? 'เหลือ ' + n + ' วิ' : '') + tabNote());
                }
            });

            await sleep(CONFIG.verifyDelay);

            const alertEl = byId('alert');
            if (alertEl) alertEl.innerHTML = '';   // เคลียร์ข้อความเก่า จะได้จับ error ใหม่ได้

            log('③ กดปุ่ม "ยืนยัน"');
            verifyBtn.click();

            const outcome = await waitFor(() => {
                if (!isHidden(els.final)) return 'final';
                const sp = byId('special_link');
                if (sp && sp.value) return 'special';
                if (alertEl && alertEl.textContent.trim()) return 'error';
                return null;
            }, {
                timeout: CONFIG.verifyTimeout,
                label: 'เซิร์ฟเวอร์ไม่ตอบ',
                onTick: () => log('③ รอเซิร์ฟเวอร์ตอบกลับ…')
            });

            if (outcome === 'error') {
                log('❌ เว็บปฏิเสธ: ' + alertEl.textContent.trim() + '\nรีโหลดหน้าแล้วลองใหม่', true);
                removeStopButton();
                return;
            }

            if (outcome === 'special') {
                log('🎯 ถึงปลายทางแล้ว (ลิงก์พิเศษ) กดปุ่ม "Open Link" ในหน้าได้เลย');
                removeStopButton();
                return;
            }

            // ---------- ปุ่ม 3: ไปต่อ ----------
            const nextForm = els.final.querySelector('form');
            const nextBtn = nextForm && nextForm.querySelector('button[type="submit"]');
            const tokenEl = nextForm && nextForm.querySelector('input[name="speed_token"]');

            if (!nextBtn) {
                log('❌ ไม่พบปุ่ม "ไปต่อ"', true);
                removeStopButton();
                return;
            }

            // รอให้เว็บใส่ action + token ลงฟอร์มก่อน
            await waitFor(() => nextForm.getAttribute('action') && tokenEl && tokenEl.value, {
                timeout: 10000,
                label: 'ฟอร์มปุ่มไปต่อยังไม่พร้อม'
            });

            await sleep(CONFIG.nextDelay);

            log('④ กดปุ่ม "ไปต่อ"');
            nextBtn.click();
            log('✅ กำลังไปหน้าถัดไป…');
            removeStopButton();

        } catch (err) {
            if (err === STOP) return;
            console.error('[AdSkip]', err);
            log('⚠️ ' + err.message, true);
            removeStopButton();
        }
    }

    // ============================================
    // 🏁 Initialize
    // ============================================
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
            return;
        }

        const els = findElements();
        if (!els) return; // ไม่ใช่หน้า AdLink → ไม่ต้องทำอะไร

        injectStyles();
        createLogBox();
        createStopButton();

        run(els);
    }

    init();
})();
