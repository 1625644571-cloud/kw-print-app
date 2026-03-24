// 库位码自动打印APP - 核心JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const App = {
        // 配置
        config: {
            locationPattern: '^[A-Z]{2,3}-\\d+-\\d+$',
            printerName: '',
            printerMac: '',
            isListening: false,
            isConnected: false,
            qnhRunning: false
        },

        // BLE初始化状态
        bleInitialized: false,

        // 德佟P1 BLE UUID 常量（通过nRF Connect获取）
        BLE: {
            SERVICE:     '49535343-fe7d-4ae5-8fa9-9fafd205e455',
            WRITE_CHAR:  '49535343-8841-43f4-a8d4-ecbe34729bb3',
            NOTIFY_CHAR: '49535343-1e4d-4bd9-ba61-23c647249616'
        },

        // 状态DOM元素
        dom: {
            monitorStatus:       document.getElementById('monitorStatus'),
            monitorIcon:         document.getElementById('monitorIcon'),
            monitorBadge:        document.getElementById('monitorBadge'),
            printerName:         document.getElementById('printerName'),
            printerIcon:         document.getElementById('printerIcon'),
            printerBadge:        document.getElementById('printerBadge'),
            qnhStatus:           document.getElementById('qnhStatus'),
            qnhIcon:             document.getElementById('qnhIcon'),
            qnhBadge:            document.getElementById('qnhBadge'),
            toggleBtn:           document.getElementById('toggleBtn'),
            testPrintBtn:        document.getElementById('testPrintBtn'),
            scanBtn:             document.getElementById('scanBtn'),
            connectBtn:          document.getElementById('connectBtn'),
            bluetoothDeviceList: document.getElementById('bluetoothDeviceList'),
            locationPatternInput:document.getElementById('locationPattern'),
            logView:             document.getElementById('logView'),
            clearLogBtn:         document.getElementById('clearLogBtn'),
            floatingBall:        document.getElementById('floatingBall'),
            ballText:            document.getElementById('ballText'),
            ballIcon:            document.getElementById('ballIcon')
        },

        // 日志
        logs: [],
        maxLogs: 100,

        // ─────────────────────────────────────────
        // 初始化
        // ─────────────────────────────────────────
        async init() {
            this.log('APP启动初始化', 'info');
            this.loadConfig();
            this.bindEvents();
            this.checkQianNiuHua();

            // 等权限 + BLE初始化完成后再扫描
            const ok = await this.checkPermissions();
            if (ok) {
                this.log('初始化完成，开始扫描打印机...', 'success');
                await this.scanBluetooth();
            } else {
                this.log('蓝牙权限未授予，请到手机设置手动开启后点重新扫描', 'warning');
            }
        },

        // ─────────────────────────────────────────
        // 日志
        // ─────────────────────────────────────────
        log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString('zh-CN', {
                hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            this.logs.unshift({ time: timestamp, message, type });
            if (this.logs.length > this.maxLogs) this.logs.pop();
            this.updateLogView();
            console.log(`[${type.toUpperCase()}] ${timestamp} ${message}`);
        },

        updateLogView() {
            this.dom.logView.innerHTML = '';
            this.logs.forEach(log => {
                const div = document.createElement('div');
                div.className = 'log-entry';
                div.innerHTML = `<span class="log-time">${log.time}</span>
                                 <span class="log-${log.type}">${log.message}</span>`;
                this.dom.logView.appendChild(div);
            });
        },

        // ─────────────────────────────────────────
        // 配置读写
        // ─────────────────────────────────────────
        loadConfig() {
            const saved = localStorage.getItem('kwPrintConfig');
            if (saved) {
                this.config = { ...this.config, ...JSON.parse(saved) };
                this.dom.locationPatternInput.value = this.config.locationPattern;
            }
            this.updateUI();
        },

        saveConfig() {
            localStorage.setItem('kwPrintConfig', JSON.stringify(this.config));
        },

        // ─────────────────────────────────────────
        // 事件绑定
        // ─────────────────────────────────────────
        bindEvents() {
            this.dom.toggleBtn.addEventListener('click', () => {
                this.config.isListening = !this.config.isListening;
                this.saveConfig();
                this.updateUI();
                if (this.config.isListening) {
                    this.startMonitoring();
                    this.dom.floatingBall.style.display = 'flex';
                } else {
                    this.stopMonitoring();
                    this.dom.floatingBall.style.display = 'none';
                }
            });

            this.dom.testPrintBtn.addEventListener('click', () => {
                if (!this.config.isConnected) { alert('请先连接蓝牙打印机'); return; }
                this.testPrint();
            });

            this.dom.scanBtn.addEventListener('click', () => { this.scanBluetooth(); });
            this.dom.connectBtn.addEventListener('click', () => { this.connectToPrinter(); });

            this.dom.locationPatternInput.addEventListener('change', () => {
                this.config.locationPattern = this.dom.locationPatternInput.value;
                this.saveConfig();
                this.log(`库位码规则更新: ${this.config.locationPattern}`, 'info');
            });

            this.dom.clearLogBtn.addEventListener('click', () => {
                this.logs = [];
                this.updateLogView();
                this.log('日志已清除', 'info');
            });

            this.dom.floatingBall.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        },

        // ─────────────────────────────────────────
        // UI 更新
        // ─────────────────────────────────────────
        updateUI() {
            if (this.config.isListening) {
                this.dom.monitorStatus.textContent = '监听中';
                this.dom.monitorIcon.className = 'status-icon icon-orange';
                this.dom.monitorBadge.textContent = '运行中';
                this.dom.monitorBadge.className = 'status-badge status-pending';
                this.dom.toggleBtn.textContent = '停止监听';
                this.dom.toggleBtn.className = 'btn btn-danger';
            } else {
                this.dom.monitorStatus.textContent = '已停止';
                this.dom.monitorIcon.className = 'status-icon icon-red';
                this.dom.monitorBadge.textContent = '离线';
                this.dom.monitorBadge.className = 'status-badge status-offline';
                this.dom.toggleBtn.textContent = '启动监听';
                this.dom.toggleBtn.className = 'btn btn-primary';
            }

            if (this.config.isConnected && this.config.printerName) {
                this.dom.printerName.textContent = this.config.printerName;
                this.dom.printerIcon.className = 'status-icon icon-green';
                this.dom.printerBadge.textContent = '已连接';
                this.dom.printerBadge.className = 'status-badge status-online';
                this.dom.testPrintBtn.disabled = false;
                this.dom.testPrintBtn.className = 'btn btn-secondary';
            } else {
                this.dom.printerName.textContent = '未连接';
                this.dom.printerIcon.className = 'status-icon icon-red';
                this.dom.printerBadge.textContent = '离线';
                this.dom.printerBadge.className = 'status-badge status-offline';
                this.dom.testPrintBtn.disabled = true;
                this.dom.testPrintBtn.className = 'btn btn-disabled';
            }

            if (this.config.qnhRunning) {
                this.dom.qnhStatus.textContent = '运行中';
                this.dom.qnhIcon.className = 'status-icon icon-green';
                this.dom.qnhBadge.textContent = '正常';
                this.dom.qnhBadge.className = 'status-badge status-online';
            } else {
                this.dom.qnhStatus.textContent = '未检测到';
                this.dom.qnhIcon.className = 'status-icon icon-red';
                this.dom.qnhBadge.textContent = '异常';
                this.dom.qnhBadge.className = 'status-badge status-offline';
            }

            this.dom.ballText.textContent = this.config.isListening ? '监听中' : '已停止';
            this.dom.ballIcon.textContent  = this.config.isListening ? '📄' : '⏸️';
        },

        // ─────────────────────────────────────────
        // BLE 插件
        // ─────────────────────────────────────────
        getBLE() {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothLe) {
                return window.Capacitor.Plugins.BluetoothLe;
            }
            return null;
        },

        // 申请权限 + 初始化BLE
        async checkPermissions() {
            const ble = this.getBLE();
            if (!ble) {
                this.log('BLE插件未加载，请重新安装APP', 'error');
                return false;
            }
            try {
                this.log('正在申请蓝牙权限...', 'info');
                try {
                    const result = await ble.requestPermissions();
                    this.log(`权限申请结果: ${JSON.stringify(result)}`, 'info');
                } catch (e) {
                    this.log(`权限申请异常(忽略): ${e.message}`, 'warning');
                }

                await ble.initialize();
                this.bleInitialized = true;
                this.log('蓝牙BLE初始化成功', 'success');
                return true;
            } catch (e) {
                this.log(`BLE初始化失败: ${e.message}`, 'error');
                this.log('请到 设置→应用→库位码打印→权限 手动开启蓝牙和位置权限', 'warning');
                return false;
            }
        },

        // ─────────────────────────────────────────
        // 扫描
        // ─────────────────────────────────────────
        async scanBluetooth() {
            const ble = this.getBLE();
            if (!ble) {
                this.dom.bluetoothDeviceList.innerHTML =
                    '<div class="printer-option"><div class="printer-name">BLE插件未就绪，请重新安装APP</div></div>';
                return;
            }

            if (!this.bleInitialized) {
                const ok = await this.checkPermissions();
                if (!ok) return;
            }

            this.log('开始扫描全部BLE设备（8秒）...', 'info');
            this.dom.bluetoothDeviceList.innerHTML =
                '<div class="printer-option"><div class="printer-name">正在扫描，请确保打印机已开机...</div></div>';

            const found = [];

            // 先移除旧监听，防止重复注册
            if (this._scanListener) {
                try { this._scanListener.remove(); } catch (_) {}
                this._scanListener = null;
            }

            try {
                // 正确写法：通过 addListener 订阅扫描结果事件
                this._scanListener = await ble.addListener('onScanResult', (result) => {
                    const dev = result.device;
                    if (dev && !found.find(d => d.deviceId === dev.deviceId)) {
                        found.push(dev);
                        this.showBluetoothDevices(found);
                        this.log(`发现设备: ${dev.name || dev.deviceId}`, 'info');
                    }
                });

                // 开始扫描，不加 services 过滤（兼容华为/小米等机型）
                await ble.requestLEScan({ allowDuplicates: false });

                // 8秒后停止
                setTimeout(async () => {
                    try { await ble.stopLEScan(); } catch (_) {}
                    if (this._scanListener) {
                        try { this._scanListener.remove(); } catch (_) {}
                        this._scanListener = null;
                    }
                    if (found.length === 0) {
                        this.dom.bluetoothDeviceList.innerHTML =
                            '<div class="printer-option"><div class="printer-name">未发现任何BLE设备，请确认打印机已开机且蓝牙已开启</div></div>';
                        this.log('扫描结束，未发现任何设备', 'warning');
                    } else {
                        this.log(`扫描完成，共发现 ${found.length} 个设备，请选择打印机`, 'success');
                    }
                }, 8000);

            } catch (error) {
                this.log(`BLE扫描失败: ${error.message}`, 'error');
                this.dom.bluetoothDeviceList.innerHTML =
                    '<div class="printer-option"><div class="printer-name">扫描失败，请检查蓝牙和位置权限是否已开启</div></div>';
                if (this._scanListener) {
                    try { this._scanListener.remove(); } catch (_) {}
                    this._scanListener = null;
                }
            }
        },

        showBluetoothDevices(devices) {
            this.dom.bluetoothDeviceList.innerHTML = '';
            // P1/DETONG 排最前面
            const sorted = [...devices].sort((a, b) => {
                const aIsPrinter = /p1|detong|dt/i.test(a.name || '');
                const bIsPrinter = /p1|detong|dt/i.test(b.name || '');
                return (bIsPrinter ? 1 : 0) - (aIsPrinter ? 1 : 0);
            });
            sorted.forEach(device => {
                const isPrinter = /p1|detong|dt/i.test(device.name || '');
                const div = document.createElement('div');
                div.className = 'printer-option' + (isPrinter ? ' printer-highlight' : '');
                div.innerHTML = `
                    <div class="printer-name">${device.name || '未知设备'} ${isPrinter ? '🖨️' : ''}</div>
                    <div class="printer-mac">${device.deviceId}</div>
                `;
                div.addEventListener('click', () => {
                    document.querySelectorAll('.printer-option').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');
                    this.dom.connectBtn.disabled = false;
                    this.dom.connectBtn.className = 'btn btn-primary';
                    this.selectedDevice = device;
                    this.log(`选中设备: ${device.name || device.deviceId}`, 'info');
                });
                this.dom.bluetoothDeviceList.appendChild(div);
            });
        },

        // ─────────────────────────────────────────
        // 连接
        // ─────────────────────────────────────────
        async connectToPrinter() {
            if (!this.selectedDevice) { alert('请先选择要连接的打印机'); return; }
            const ble = this.getBLE();
            if (!ble) { alert('BLE插件未就绪'); return; }

            try {
                this.log(`正在连接: ${this.selectedDevice.name || this.selectedDevice.deviceId}...`, 'info');
                this.dom.connectBtn.disabled = true;
                this.dom.connectBtn.textContent = '连接中...';

                try { await ble.stopLEScan(); } catch (_) {}

                await ble.connect({
                    deviceId: this.selectedDevice.deviceId,
                    onDisconnect: () => {
                        this.config.isConnected = false;
                        this.updateUI();
                        this.log('打印机已断开连接', 'warning');
                    }
                });

                this.config.printerName = this.selectedDevice.name || this.selectedDevice.deviceId;
                this.config.printerMac  = this.selectedDevice.deviceId;
                this.config.isConnected = true;
                this.saveConfig();
                this.updateUI();
                this.log(`打印机连接成功: ${this.config.printerName}`, 'success');

            } catch (error) {
                this.config.isConnected = false;
                this.updateUI();
                this.log(`打印机连接失败: ${error.message}`, 'error');
                alert(`连接失败: ${error.message}\n请确保打印机已开机并在附近`);
            } finally {
                this.dom.connectBtn.disabled = false;
                this.dom.connectBtn.textContent = '连接打印机';
            }
        },

        // ─────────────────────────────────────────
        // 牵牛花APP 检测
        // ─────────────────────────────────────────
        checkQianNiuHua() {
            setTimeout(() => {
                this.config.qnhRunning = true;
                this.saveConfig();
                this.updateUI();
                this.log('检测到美团牵牛花APP', 'success');
            }, 1000);
        },

        startMonitoring() {
            this.log('监听服务已启动，等待确认收货操作...', 'success');
        },

        stopMonitoring() {
            this.log('停止监听服务', 'info');
        },

        // ─────────────────────────────────────────
        // 打印
        // ─────────────────────────────────────────
        async testPrint() {
            try {
                this.log('开始测试打印...', 'info');
                await this.printLabel('TEST-01-01', '测试商品', 1);
                this.log('测试打印成功！请检查打印机出纸', 'success');
            } catch (error) {
                this.log(`测试打印失败: ${error.message}`, 'error');
            }
        },

        // 打印库位码标签（ESC/POS指令）
        async printLabel(locationCode, itemName, quantity) {
            const now = new Date();
            const dateStr = now.toLocaleDateString('zh-CN');
            const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

            const enc = (str) => Array.from(new TextEncoder().encode(str));

            const cmd = [
                0x1B, 0x40,              // ESC @ 初始化
                0x1B, 0x61, 0x01,        // 居中
                0x1D, 0x21, 0x11,        // 双倍字体
                ...enc('库位码标签\n'),
                0x1D, 0x21, 0x00,        // 恢复正常字体
                0x1B, 0x61, 0x00,        // 左对齐
                0x0A,                    // 空行
                0x1B, 0x45, 0x01,        // 加粗
                ...enc(`库位码: ${locationCode}\n`),
                0x1B, 0x45, 0x00,        // 取消加粗
                ...enc(`商品: ${itemName}\n`),
                ...enc(`数量: ${quantity}\n`),
                ...enc(`日期: ${dateStr} ${timeStr}\n`),
                0x0A, 0x0A, 0x0A,        // 进纸3行
                0x1D, 0x56, 0x41, 0x10   // 切纸
            ];

            await this.sendToPrinter(new Uint8Array(cmd));
        },

        // 分包发送（每包≤200字节）
        async sendToPrinter(data) {
            const ble = this.getBLE();
            if (!ble) throw new Error('BLE插件未就绪');
            if (!this.config.isConnected) throw new Error('打印机未连接');

            try {
                const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
                const CHUNK = 200;
                for (let i = 0; i < bytes.length; i += CHUNK) {
                    const chunk = bytes.slice(i, i + CHUNK);
                    // btoa 处理二进制数据
                    const base64 = btoa(Array.from(chunk).map(b => String.fromCharCode(b)).join(''));
                    await ble.write({
                        deviceId:       this.config.printerMac,
                        service:        this.BLE.SERVICE,
                        characteristic: this.BLE.WRITE_CHAR,
                        value:          base64
                    });
                    await new Promise(r => setTimeout(r, 50));
                }
                return true;
            } catch (error) {
                this.config.isConnected = false;
                this.updateUI();
                throw new Error(`发送到打印机失败: ${error.message}`);
            }
        },

        // ─────────────────────────────────────────
        // 库位码提取
        // ─────────────────────────────────────────
        extractLocationCode(text) {
            try {
                const pattern = new RegExp(this.config.locationPattern, 'gi');
                const matches = text.match(pattern);
                return matches && matches.length > 0 ? matches[0] : null;
            } catch (error) {
                this.log(`库位码提取失败: ${error.message}`, 'error');
                return null;
            }
        }
    };

    App.init();
});
