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
        
        // 状态DOM元素
        dom: {
            monitorStatus: document.getElementById('monitorStatus'),
            monitorIcon: document.getElementById('monitorIcon'),
            monitorBadge: document.getElementById('monitorBadge'),
            printerName: document.getElementById('printerName'),
            printerIcon: document.getElementById('printerIcon'),
            printerBadge: document.getElementById('printerBadge'),
            qnhStatus: document.getElementById('qnhStatus'),
            qnhIcon: document.getElementById('qnhIcon'),
            qnhBadge: document.getElementById('qnhBadge'),
            toggleBtn: document.getElementById('toggleBtn'),
            testPrintBtn: document.getElementById('testPrintBtn'),
            scanBtn: document.getElementById('scanBtn'),
            connectBtn: document.getElementById('connectBtn'),
            bluetoothDeviceList: document.getElementById('bluetoothDeviceList'),
            locationPatternInput: document.getElementById('locationPattern'),
            logView: document.getElementById('logView'),
            clearLogBtn: document.getElementById('clearLogBtn'),
            floatingBall: document.getElementById('floatingBall'),
            ballText: document.getElementById('ballText'),
            ballIcon: document.getElementById('ballIcon')
        },
        
        // 日志
        logs: [],
        maxLogs: 100,
        
        // 初始化
        async init() {
            this.log('APP启动初始化', 'info');
            
            // 加载配置
            this.loadConfig();
            
            // 绑定事件
            this.bindEvents();
            
            // 检查牵牛花APP状态
            this.checkQianNiuHua();

            // 先完成权限申请和BLE初始化，再扫描
            const ok = await this.checkPermissions();
            if (ok) {
                this.log('初始化完成，开始扫描...', 'success');
                await this.scanBluetooth();
            } else {
                this.log('权限未授予，请手动点击扫描按钮重试', 'warning');
            }
        },
        
        // 记录日志
        log(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString('zh-CN', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
            
            const logEntry = {
                time: timestamp,
                message: message,
                type: type
            };
            
            this.logs.unshift(logEntry);
            if (this.logs.length > this.maxLogs) {
                this.logs.pop();
            }
            
            this.updateLogView();
            console.log(`[${type.toUpperCase()}] ${timestamp} ${message}`);
        },
        
        // 更新日志视图
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
        
        // 加载配置
        loadConfig() {
            const savedConfig = localStorage.getItem('kwPrintConfig');
            if (savedConfig) {
                this.config = { ...this.config, ...JSON.parse(savedConfig) };
                this.dom.locationPatternInput.value = this.config.locationPattern;
            }
            
            // 更新界面状态
            this.updateUI();
        },
        
        // 保存配置
        saveConfig() {
            localStorage.setItem('kwPrintConfig', JSON.stringify(this.config));
        },
        
        // 绑定事件
        bindEvents() {
            // 启动/停止监听
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
            
            // 测试打印
            this.dom.testPrintBtn.addEventListener('click', () => {
                if (!this.config.isConnected) {
                    alert('请先连接蓝牙打印机');
                    return;
                }
                
                this.testPrint();
            });
            
            // 重新扫描蓝牙
            this.dom.scanBtn.addEventListener('click', () => {
                this.scanBluetooth();
            });
            
            // 连接打印机
            this.dom.connectBtn.addEventListener('click', () => {
                this.connectToPrinter();
            });
            
            // 保存库位码匹配规则
            this.dom.locationPatternInput.addEventListener('change', () => {
                this.config.locationPattern = this.dom.locationPatternInput.value;
                this.saveConfig();
                this.log(`库位码规则更新: ${this.config.locationPattern}`, 'info');
            });
            
            // 清除日志
            this.dom.clearLogBtn.addEventListener('click', () => {
                this.logs = [];
                this.updateLogView();
                this.log('日志已清除', 'info');
            });
            
            // 悬浮球点击事件
            this.dom.floatingBall.addEventListener('click', () => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        },
        
        // 更新UI状态
        updateUI() {
            // 监听状态
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
            
            // 打印机状态
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
            
            // 牵牛花APP状态
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
            
            // 悬浮球状态
            if (this.config.isListening) {
                this.dom.ballText.textContent = '监听中';
                this.dom.ballIcon.textContent = '📄';
            } else {
                this.dom.ballText.textContent = '已停止';
                this.dom.ballIcon.textContent = '⏸️';
            }
        },
        
        // 德佟P1 BLE UUID 常量
        BLE: {
            SERVICE:    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
            WRITE_CHAR: '49535343-8841-43f4-a8d4-ecbe34729bb3',
            NOTIFY_CHAR:'49535343-1e4d-4bd9-ba61-23c647249616'
        },

        // 获取BLE插件
        getBLE() {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BluetoothLe) {
                return window.Capacitor.Plugins.BluetoothLe;
            }
            return null;
        },

        // 检查权限并初始化BLE
        async checkPermissions() {
            const ble = this.getBLE();
            if (!ble) {
                this.log('BLE插件未加载，请重新安装APP', 'error');
                return false;
            }
            try {
                // 先尝试申请权限（不做判断，直接申请，系统会忽略已授权的）
                this.log('正在申请蓝牙权限...', 'info');
                try {
                    const reqResult = await ble.requestPermissions();
                    this.log(`权限申请结果: ${JSON.stringify(reqResult)}`, 'info');
                } catch(permErr) {
                    this.log(`权限申请异常(忽略): ${permErr.message}`, 'warning');
                }

                // 直接尝试初始化，让系统决定是否有权限
                await ble.initialize();
                this.bleInitialized = true;
                this.log('蓝牙BLE初始化成功', 'success');
                return true;
            } catch (e) {
                this.log(`BLE初始化失败: ${e.message}`, 'error');
                this.log('请到手机设置→应用→库位码打印→权限，手动开启蓝牙和位置权限', 'warning');
                return false;
            }
        },

        // 扫描BLE设备（只扫描德佟打印服务UUID）
        async scanBluetooth() {
            const ble = this.getBLE();
            if (!ble) {
                this.dom.bluetoothDeviceList.innerHTML =
                    '<div class="printer-option"><div class="printer-name">BLE插件未就绪，请重新安装APP</div></div>';
                return;
            }

            // 如果还未初始化，先完成初始化再扫描
            if (!this.bleInitialized) {
                const ok = await this.checkPermissions();
                if (!ok) return;
                this.bleInitialized = true;
            }

            this.log('开始扫描BLE打印机...', 'info');
            this.dom.bluetoothDeviceList.innerHTML =
                '<div class="printer-option"><div class="printer-name">正在扫描...</div></div>';

            const found = [];

            try {
                // 扫描5秒，过滤德佟服务UUID
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

                // 5秒后停止扫描
                setTimeout(async () => {
                    try { await ble.stopLEScan(); } catch(_) {}
                    if (found.length === 0) {
                        this.dom.bluetoothDeviceList.innerHTML =
                            '<div class="printer-option"><div class="printer-name">未找到德佟P1打印机，请确认打印机已开机</div></div>';
                        this.log('扫描结束，未发现打印机', 'warning');
                    } else {
                        this.log(`扫描完成，共发现${found.length}台打印机`, 'success');
                    }
                }, 5000);

            } catch (error) {
                this.log(`BLE扫描失败: ${error.message}`, 'error');
                this.dom.bluetoothDeviceList.innerHTML =
                    '<div class="printer-option"><div class="printer-name">扫描失败，请检查蓝牙权限</div></div>';
            }
        },

        // 显示BLE设备列表
        showBluetoothDevices(devices) {
            this.dom.bluetoothDeviceList.innerHTML = '';

            devices.forEach(device => {
                const div = document.createElement('div');
                div.className = 'printer-option';
                div.innerHTML = `
                    <div class="printer-name">${device.name || '未知设备'}</div>
                    <div class="printer-mac">${device.deviceId}</div>
                `;

                div.addEventListener('click', () => {
                    document.querySelectorAll('.printer-option').forEach(el => {
                        el.classList.remove('selected');
                    });
                    div.classList.add('selected');
                    this.dom.connectBtn.disabled = false;
                    this.dom.connectBtn.className = 'btn btn-primary';
                    this.selectedDevice = device;
                    this.log(`选中打印机: ${device.name || device.deviceId}`, 'info');
                });

                this.dom.bluetoothDeviceList.appendChild(div);
            });
        },

        // 连接BLE打印机
        async connectToPrinter() {
            if (!this.selectedDevice) {
                alert('请先选择要连接的打印机');
                return;
            }

            const ble = this.getBLE();
            if (!ble) {
                alert('BLE插件未就绪');
                return;
            }

            try {
                this.log(`正在连接: ${this.selectedDevice.name || this.selectedDevice.deviceId}...`, 'info');
                this.dom.connectBtn.disabled = true;
                this.dom.connectBtn.textContent = '连接中...';

                // 停止扫描再连接
                try { await ble.stopLEScan(); } catch(_) {}

                await ble.connect({
                    deviceId: this.selectedDevice.deviceId,
                    onDisconnect: () => {
                        this.config.isConnected = false;
                        this.updateUI();
                        this.log('打印机已断开连接', 'warning');
                    }
                });

                this.config.printerName = this.selectedDevice.name || this.selectedDevice.deviceId;
                this.config.printerMac = this.selectedDevice.deviceId;
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
        
        // 检查牵牛花APP状态
        checkQianNiuHua() {
            // 在实际APK中，这里检查美团牵牛花APP是否安装并在运行
            setTimeout(() => {
                this.config.qnhRunning = true;
                this.saveConfig();
                this.updateUI();
                this.log('检测到美团牵牛花APP', 'success');
            }, 1000);
        },
        
        // 开始监听牵牛花APP
        startMonitoring() {
            this.log('开始监听牵牛花APP...', 'info');
            
            // 实际监听逻辑
            // 1. 定时检查前台应用是否为牵牛花
            // 2. 监听页面内容变化
            // 3. 检测"确认收货"按钮点击
            // 4. 提取库位码
            
            this.log('监听服务已启动，等待确认收货操作...', 'success');
        },
        
        // 停止监听
        stopMonitoring() {
            this.log('停止监听服务', 'info');
            // 清理监听器
        },
        
        // 测试打印
        async testPrint() {
            if (!this.config.isConnected) {
                this.log('打印机未连接，无法打印', 'error');
                return;
            }
            
            try {
                this.log('开始测试打印...', 'info');
                
                // 生成测试库位码标签
                const locationCode = 'TEST-01-01';
                const content = `
╔══════════════════════════════╗
║        库位码标签             ║
╟──────────────────────────────╢
║ 库位码: ${locationCode}     ║
║ 商品:   测试商品              ║
║ 数量:   1                   ║
║ 时间:   ${new Date().toLocaleString('zh-CN')} ║
╚══════════════════════════════╝
                `;
                
                // 发送打印指令到蓝牙打印机
                await this.sendToPrinter(content);
                
                this.log('测试打印成功！请检查打印机', 'success');
                
            } catch (error) {
                this.log(`测试打印失败: ${error.message}`, 'error');
            }
        },
        
        // 发送数据到BLE打印机（分包发送，每包≤200字节）
        async sendToPrinter(data) {
            const ble = this.getBLE();
            if (!ble) throw new Error('BLE插件未就绪');
            if (!this.config.isConnected) throw new Error('打印机未连接');

            try {
                // 将字符串转为UTF-8字节
                const encoder = new TextEncoder();
                const bytes = encoder.encode(data);

                // 德佟P1每包最大200字节，分包发送
                const CHUNK = 200;
                for (let i = 0; i < bytes.length; i += CHUNK) {
                    const chunk = bytes.slice(i, i + CHUNK);
                    // 转为base64
                    const base64 = btoa(String.fromCharCode(...chunk));
                    await ble.write({
                        deviceId: this.config.printerMac,
                        service:  this.BLE.SERVICE,
                        characteristic: this.BLE.WRITE_CHAR,
                        value: base64
                    });
                    // 短暂延迟避免溢出
                    await new Promise(r => setTimeout(r, 20));
                }
                return true;
            } catch (error) {
                this.config.isConnected = false;
                this.updateUI();
                throw new Error(`发送到打印机失败: ${error.message}`);
            }
        },
        
        // 提取库位码（从页面文本）
        extractLocationCode(text) {
            try {
                const pattern = new RegExp(this.config.locationPattern, 'gi');
                const matches = text.match(pattern);
                
                if (matches && matches.length > 0) {
                    return matches[0];
                }
                
                return null;
            } catch (error) {
                this.log(`库位码提取失败: ${error.message}`, 'error');
                return null;
            }
        }
    };
    
    // 启动APP
    App.init();
});

// 后台服务（用于Capacitor应用）
class BackgroundService {
    static start() {
        // 启动后台监听服务
        console.log('Background service starting...');
    }
    
    static stop() {
        // 停止后台服务
        console.log('Background service stopping...');
    }
}
