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
        init() {
            this.log('APP启动初始化', 'info');
            
            // 加载配置
            this.loadConfig();
            
            // 绑定事件
            this.bindEvents();
            
            // 检查权限
            this.checkPermissions();
            
            // 初始化蓝牙扫描
            this.scanBluetooth();
            
            // 检查牵牛花APP状态
            this.checkQianNiuHua();
            
            this.log('初始化完成', 'success');
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
        
        // 检查权限
        checkPermissions() {
            if (typeof navigator.bluetooth === 'undefined') {
                this.log('当前环境不支持Web蓝牙API', 'error');
                alert('当前环境不支持蓝牙功能，请确保在支持Web蓝牙的浏览器或环境中运行');
                return false;
            }
            
            // 检查后台运行权限（使用Capacitor时）
            if (typeof Capacitor !== 'undefined') {
                this.log('Capacitor环境检测通过', 'success');
            }
            
            return true;
        },
        
        // 扫描蓝牙设备
        async scanBluetooth() {
            try {
                this.log('开始扫描蓝牙设备...', 'info');
                this.dom.bluetoothDeviceList.innerHTML = 
                    '<div class="printer-option" id="scanningMsg"><div class="printer-name">正在扫描蓝牙设备...</div></div>';
                
                // 模拟蓝牙设备列表（实际使用时替换为真实蓝牙API）
                setTimeout(() => {
                    this.showBluetoothDevices([
                        { name: 'GP-80160', mac: '00:11:22:AA:BB:CC', type: 'printer' },
                        { name: 'HM-A300', mac: 'AA:BB:CC:DD:EE:FF', type: 'printer' },
                        { name: 'NIIMBOT-D110', mac: 'FF:EE:DD:CC:BB:AA', type: 'printer' }
                    ]);
                }, 2000);
                
            } catch (error) {
                this.log(`蓝牙扫描失败: ${error.message}`, 'error');
            }
        },
        
        // 显示蓝牙设备列表
        showBluetoothDevices(devices) {
            this.dom.bluetoothDeviceList.innerHTML = '';
            
            if (devices.length === 0) {
                this.dom.bluetoothDeviceList.innerHTML = 
                    '<div class="printer-option"><div class="printer-name">未发现蓝牙打印机</div></div>';
                return;
            }
            
            devices.forEach(device => {
                const div = document.createElement('div');
                div.className = 'printer-option';
                div.innerHTML = `
                    <div class="printer-name">${device.name}</div>
                    <div class="printer-mac">${device.mac}</div>
                `;
                
                div.addEventListener('click', () => {
                    // 清除其他选中状态
                    document.querySelectorAll('.printer-option').forEach(el => {
                        el.classList.remove('selected');
                    });
                    
                    // 选中当前设备
                    div.classList.add('selected');
                    
                    // 启用连接按钮
                    this.dom.connectBtn.disabled = false;
                    this.dom.connectBtn.className = 'btn btn-primary';
                    
                    // 保存选中设备
                    this.selectedDevice = device;
                    this.log(`选中打印机: ${device.name} (${device.mac})`, 'info');
                });
                
                this.dom.bluetoothDeviceList.appendChild(div);
            });
            
            this.log(`发现${devices.length}个蓝牙设备`, 'success');
        },
        
        // 连接打印机
        async connectToPrinter() {
            if (!this.selectedDevice) {
                alert('请先选择要连接的打印机');
                return;
            }
            
            try {
                this.log(`正在连接打印机: ${this.selectedDevice.name}...`, 'info');
                
                // 模拟连接过程
                setTimeout(() => {
                    this.config.printerName = this.selectedDevice.name;
                    this.config.printerMac = this.selectedDevice.mac;
                    this.config.isConnected = true;
                    this.saveConfig();
                    this.updateUI();
                    
                    this.log(`打印机连接成功: ${this.selectedDevice.name}`, 'success');
                }, 1000);
                
            } catch (error) {
                this.log(`打印机连接失败: ${error.message}`, 'error');
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
        
        // 发送到打印机（ESC/POS指令）
        async sendToPrinter(content) {
            try {
                // 这里是ESC/POS指令示例
                // 实际指令根据打印机型号调整
                const escposCommands = [
                    '\x1B\x40', // 初始化
                    '\x1D\x21\x11', // 字体大小
                    content,
                    '\n\n\n', // 切纸
                    '\x1B\x64\x03' // 进纸3行
                ];
                
                // 模拟打印
                this.log(`发送打印指令: ${content.substring(0, 50)}...`, 'info');
                
                // 实际代码使用Web Bluetooth API:
                // const device = await navigator.bluetooth.requestDevice(...);
                // const server = await device.gatt.connect();
                // const service = await server.getPrimaryService(...);
                // const characteristic = await service.getCharacteristic(...);
                // await characteristic.writeValue(new TextEncoder().encode(escposCommands.join('')));
                
                // 这里模拟打印成功
                return true;
                
            } catch (error) {
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