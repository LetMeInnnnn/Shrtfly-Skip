// ==UserScript==
// @name         Shrtfly Skip
// @namespace    https://github.com/LetMeInnnnn
// @version      6.7
// @description  ข้ามหน้า AdLink อัตโนมัติ + ซ่อนโฆษณา
// @author       naLeei, ChatGPT
// @homepageURL  https://github.com/LetMeInnnnn/Shrtfly-Skip
//
// @match        https://loan.*.net/*
// @match        https://techetta.digital/*
// @match        https://srtslug.biz/*
// @match        https://achivas.life/*
// @match        https://napmap.life/*
//
// @icon         https://preview.redd.it/jbcj0uqbihg41.jpg?width=1080&crop=smart&auto=webp&s=7a529d0abe43ab1f3594f59724b2d9072b6ab56b
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // State management
    const state = {
        timers: [],
        workers: [],
        stopped: false,
        logBox: null,
        stopBtn: null
    };

    // รายการตำแหน่งที่ต้องบล็อก (ทุกเว็บใช้เหมือนกัน)
    const hideSelectors = [
        ".flex.flex-row.justify-between.items-center.my-5",
        ".text-blue-400.uppercase.tracking-wider.text-sm.font-medium",
        ".text-4xl.lg\\:text-5xl.font-bold.lg\\:tracking-tight.mt-1.lg\\:leading-tight",
        ".mx-auto.prose.prose-lg.mt-6.max-w-screen-lg > div:nth-of-type(1)",
        ".mx-auto.prose.prose-lg.mt-6.max-w-screen-lg > div:nth-of-type(1) > div:nth-of-type(1)",
        ".mx-auto.prose.prose-lg.mt-6.max-w-screen-lg > div:nth-of-type(1) > div:nth-of-type(3)",
        ".my-20",
        "hr.mt-8",
        "div.w-full.flex.flex-wrap.items-center.justify-evenly.gap-3"
    ];

    // ซ่อนทุก selector ในทุกเว็บ
    hideSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.remove();
        });
    });

    // ============================================
    // 🎨 CSS Injection
    // ============================================
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #adskip-log-box {
                position: fixed;
                bottom: 70px;
                right: 20px;
                max-width: 280px;
                background: rgba(0, 0, 0, 0.9);
                color: #00ff00;
                padding: 12px 15px;
                border-radius: 10px;
                font-size: 13px;
                line-height: 1.5em;
                z-index: 99999;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.7);
                font-family: 'Consolas', 'Monaco', monospace;
                transition: all 0.3s ease;
                opacity: 0.8;
                border: 1px solid rgba(0, 255, 0, 0.3);
            }
            #adskip-log-box:hover {
                opacity: 1;
                transform: translateY(-2px);
            }
            #adskip-stop-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 10px 18px;
                z-index: 99999;
                background: linear-gradient(135deg, #d33 0%, #a11 100%);
                color: #fff;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 3px 12px rgba(0, 0, 0, 0.6);
                font-size: 14px;
                font-weight: 600;
                opacity: 0.9;
                transition: all 0.2s ease;
            }
            #adskip-stop-btn:hover {
                opacity: 1;
                transform: scale(1.05);
                box-shadow: 0 4px 15px rgba(211, 51, 51, 0.5);
            }
            #adskip-stop-btn:active {
                transform: scale(0.98);
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // 🪵 Logging System
    // ============================================
    function createLogBox() {
        if (state.logBox) return state.logBox;

        const logBox = document.createElement('div');
        logBox.id = 'adskip-log-box';
        logBox.textContent = '📢 AdSkip พร้อมทำงาน...';
        document.body.appendChild(logBox);
        state.logBox = logBox;
        return logBox;
    }

    function addLog(message, isError = false) {
        if (state.stopped) return;

        try {
            const logBox = state.logBox || createLogBox();
            logBox.textContent = message;
            if (isError) {
                logBox.style.color = '#ff5555';
            } else {
                logBox.style.color = '#00ff00';
            }
            logBox.style.opacity = '1';
            setTimeout(() => { logBox.style.opacity = '0.95'; }, 300);
            console.log(`[AdSkip] ${message}`);
        } catch (e) {
            console.error('[AdSkip] Log error:', e);
        }
    }

    // ============================================
    // ⏳ Countdown with Web Worker
    // ============================================
    function countdownLog(seconds, prefix, callback) {
        if (state.stopped) return;

        if (window.Worker) {
            try {
                const workerCode = `
                    let time = ${seconds};
                    const step = 0.1;
                    function tick() {
                        postMessage({ type: 'tick', time: time.toFixed(1) });
                        time = +(time - step).toFixed(1);
                        if (time >= 0) {
                            setTimeout(tick, step * 1000);
                        } else {
                            postMessage({ type: 'done' });
                        }
                    }
                    tick();
                `;
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                const worker = new Worker(URL.createObjectURL(blob));
                state.workers.push(worker);

                worker.onmessage = function (e) {
                    if (state.stopped) {
                        worker.terminate();
                        return;
                    }
                    if (e.data.type === 'done') {
                        worker.terminate();
                        callback();
                    } else if (e.data.type === 'tick') {
                        addLog(`${prefix} (${e.data.time}s)`);
                    }
                };

                worker.onerror = function (error) {
                    console.error('[AdSkip] Worker error:', error);
                    worker.terminate();
                    fallbackCountdown(seconds, prefix, callback);
                };

            } catch (e) {
                console.error('[AdSkip] Worker creation failed:', e);
                fallbackCountdown(seconds, prefix, callback);
            }
        } else {
            fallbackCountdown(seconds, prefix, callback);
        }
    }

    function fallbackCountdown(seconds, prefix, callback) {
        let time = seconds;
        const step = 0.1;

        function tick() {
            if (state.stopped) return;
            addLog(`${prefix} (${time.toFixed(1)}s)`);
            time = +(time - step).toFixed(1);
            if (time >= 0) {
                const t = setTimeout(tick, step * 1000);
                state.timers.push(t);
            } else {
                callback();
            }
        }
        tick();
    }

    // ============================================
    // 🎯 Main Script Logic
    // ============================================
    function clickButton(selector, description) {
        try {
            const btn = typeof selector === 'string'
                ? document.querySelector(selector)
                : selector;

            if (btn && typeof btn.click === 'function') {
                btn.click();
                addLog(`✅ ${description}`);
                return true;
            }
            return false;
        } catch (e) {
            console.error(`[AdSkip] Click error (${description}):`, e);
            return false;
        }
    }

    function findButtonByText(textArray) {
        for (const text of textArray) {
            try {
                const xpath = `//button[contains(normalize-space(.),'${text}')]`;
                const result = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );
                if (result.singleNodeValue) {
                    return { button: result.singleNodeValue, text };
                }
            } catch (e) {
                console.error('[AdSkip] XPath error:', e);
            }
        }
        return null;
    }

    function runScript() {
        if (state.stopped) return;

        try {
            const startElem = document.querySelector('[id$="_start_area"]');

            if (!startElem) {
                addLog('❌ ไม่พบหน้าแรก', true);
                return;
            }

            const code = startElem.id.replace('_start_area', '');
            const areaId = code + '_area';
            const areaElem = document.getElementById(areaId);

            addLog('🔍 ซ่อนหน้าแรกแล้ว');
            startElem.classList.add('hidden');

            // Step 1: Switch to main area
            countdownLog(5.5, '⏳ หน่วงเวลาแสดง', () => {
                if (state.stopped || !areaElem) {
                    if (!areaElem) addLog(`❌ ไม่พบหน้าหลัก: ${areaId}`, true);
                    return;
                }

                areaElem.classList.remove('hidden');
                addLog('✅ แสดงส่วนถัดไป');

                // Step 2: Click main button
                countdownLog(1.0, '⏳ รอกดปุ่มหลัก', () => {
                    if (state.stopped) return;

                    const btn = areaElem.querySelector('button');
                    if (!clickButton(btn, '✅ กดปุ่มหลักเรียบร้อย')) {
                        addLog('⚠️ ไม่พบปุ่มหลัก', true);
                    }

                    // Step 3: Click next button
                    countdownLog(3.0, '⏳ รอกดปุ่มถัดไป', () => {
                        if (state.stopped) return;

                        const nextButtonTexts = [
                            'Next Post', 'Continue', 'Next',
                            'Proceed', 'Go next', 'Get to next step'
                        ];
                        const found = findButtonByText(nextButtonTexts);

                        if (found) {
                            clickButton(found.button, `กดปุ่ม "${found.text}" สำเร็จ`);
                        } else {
                            addLog('❌ ไม่พบปุ่มถัดไป', true);
                        }
                    });
                });
            });

        } catch (e) {
            console.error('[AdSkip] Runtime error:', e);
            addLog('❌ เกิดข้อผิดพลาด: ' + e.message, true);
        }
    }

    // ============================================
    // 🛑 Stop Script
    // ============================================
    function stopScript() {
        const nextButtonTexts = ['Open', 'Start', 'Click here to start', 'Begin'];
        const found = findButtonByText(nextButtonTexts);
        if (found) {
            clickButton(found.button);
        }

        addLog('🛑 สคริปต์ถูกหยุด (รีโหลดเพื่อเริ่มใหม่)');

        state.stopped = true;

        // Clear all timers
        state.timers.forEach(t => clearTimeout(t));
        state.timers = [];

        // Terminate all workers
        state.workers.forEach(w => {
            try { w.terminate(); } catch (e) {}
        });
        state.workers = [];

        // Restore UI
        try {
            const startElem = document.querySelector('[id$="_start_area"]');
            if (startElem) startElem.classList.remove('hidden');
        } catch (e) {}

        if (state.stopBtn) {
            state.stopBtn.remove();
            state.stopBtn = null;
        }
    }

    // ============================================
    // 🔴 Create Stop Button
    // ============================================
    function createStopButton() {
        const stopBtn = document.createElement('button');
        stopBtn.id = 'adskip-stop-btn';
        stopBtn.textContent = '⏹ หยุดสคริปต์';
        stopBtn.title = 'กดเพื่อหยุด (ต้องรีโหลดเพื่อเริ่มใหม่)';

        stopBtn.addEventListener('click', stopScript);

        document.body.appendChild(stopBtn);
        state.stopBtn = stopBtn;
    }

    // ============================================
    // 🚀 Initialize
    // ============================================
    function init() {
        // Wait for DOM to be fully ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        try {
            injectStyles();
            createLogBox();
            createStopButton();

            // Small delay to ensure everything is rendered
            setTimeout(() => {
                if (!state.stopped) runScript();
            }, 100);

        } catch (e) {
            console.error('[AdSkip] Initialization error:', e);
        }
    }

    // Start
    init();
})();
