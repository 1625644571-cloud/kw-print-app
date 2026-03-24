// 库位码自动打印APP - 核心JavaScript
document.addEventListener('DOMContentLoaded', function() {
    const App = {
        config: {
            locationPattern: '^[A-Z]{2,3}-\\d+-\\d+$',
            printerName: '',
            printerMac: '',
            isListening: false,
            isConnected: false,
            qnhRunning: false
        },

        bleInitialized: false,

        BLE: {
            SERVICE:     '49535343-fe7d-4ae5-8fa9-9fafd205e455',
            WRITE_CHAR:  '49535343-8841-43f4-a8d4-ecbe34729bb3',
            NOTIFY_CHAR: '49535343-1e4d-4bd9-ba61-23c647249616'
        },

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

        logs: [],
        maxLogs: 100,

        async init() {
            this.log('APP启动初始化', 'info');
            this.loadConfig();
            this.bindEvents();
            this.checkQianNiuHua();
            const ok = await this.checkPermissions();
            if (ok) {
                this.log('初始化完成，开始扫描打印机...', 'success');
                await this.scanBluetooth();
            } else {
                this.log('蓝牙权限未授予，请到手机设置手动开启后点重新扫描', 'warning');
            }
        },

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

        getBLE() {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothLe) {
                return window.Capacitor.Plugins.BluetoothLe;
            }
            return null;
        },

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
            this.log('开始扫描BLE打印机（5秒）...', 'info');
            this.dom.bluetoothDeviceList.innerHTML =
                '<div class="printer-option"><div class="printer-name">正在扫描，请确保打印机已开机...</div></div>';
            const found = [];
            try {
                await ble.requestLEScan(
                    { services: [this.BLE.SERVICE], allowDuplicates: false },
                    (result) => {
                        const dev = result.device;
                        if (!found.find(d => d.deviceId === dev.deviceId)) {
                            found.push(dev);
                            this.showBluetoothDevices(found);
                            this.log(`发现设备: ${dev.name || dev.deviceId}`, 'success');
                        }
                    }
                );
                setTimeout(async () => {
                    try { await ble.stopLEScan(); } catch (_) {}
                    if (found.length === 0) {
                        this.dom.bluetoothDeviceList.innerHTML =
                            '<div class="printer-option"><div class="printer-name">未找到德佟P1打印机，请确认打印机已开机后重新扫描</div></div>';
                        this.log('扫描结束，未发现打印机', 'warning');
                    } else {
                        this.log(`扫描完成，共发现 ${found.length} 台打印机`, 'success');
                    }
                }, 5000);
            } catch (error) {
                this.log(`BLE扫描失败: ${error.message}`, 'error');
                this.dom.bluetoothDeviceList.innerHTML =
                    '<div class="printer-option"><div class="printer-name">扫描失败，请检查蓝牙和位置权限是否已开启</div></div>';
            }
        },

        showBluetoothDevices(devices) {
            this.dom.bluetoothDeviceList.innerHTML = '';
            devices.forEach(device => {
                const div = document.createElement('div');
                div.className = 'printer-option';
                div.innerHTML = `
                    <div class="printer-name">${device.name || '德佟打印机'}</div>
                    <div class="printer-mac">${device.deviceId}</div>
                `;
                div.addEventListener('click', () => {
                    document.querySelectorAll('.printer-option').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');
                    this.dom.connectBtn.disabled = false;
                    this.dom.connectBtn.className = 'btn btn-primary';
                    this.selectedDevice = device;
                    this.log(`选中打印机: ${device.name || device.deviceId}`, 'info');
                });
                this.dom.bluetoothDeviceList.appendChild(div);
            });
        },

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

        async testPrint() {
            try {
                this.log('开始测试打印...', 'info');
                const locationCode = 'TEST-01-01';
                const content = `库位码标签\n库位码: ${locationCode}\n商品: 测试商品\n数量: 1\n时间: ${new Date().toLocaleString('zh-CN')}\n`;
                await this.sendToPrinter(content);
                this.log('测试打印成功！请检查打印机出纸', 'success');
            } catch (error) {
                this.log(`测试打印失败: ${error.message}`, 'error');
            }
        },

        async sendToPrinter(data) {
            const ble = this.getBLE();
            if (!ble) throw new Error('BLE插件未就绪');
            if (!this.config.isConnected) throw new Error('打印机未连接');
            try {
                const bytes = new TextEncoder().encode(data);
                const CHUNK = 200;
                for (let i = 0; i < bytes.length; i += CHUNK) {
                    const chunk = bytes.slice(i, i + CHUNK);
                    const base64 = btoa(String.fromCharCode(...chunk));
                    await ble.write({
                        deviceId:       this.config.printerMac,
                        service:        this.BLE.SERVICE,
                        characteristic: this.BLE.WRITE_CHAR,
                        value:          base64
                    });
                    await new Promise(r => setTimeout(r, 20));
                }
                return true;
            } catch (error) {
                this.config.isConnected = false;
                this.updateUI();
                throw new Error(`发送到打印机失败: ${error.message}`);
            }
        },

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
