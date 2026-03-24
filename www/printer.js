// 蓝牙打印机模块 - 支持多种打印机品牌
class BluetoothPrinter {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        this.isConnected = false;
        this.printerType = 'unknown';
    }
    
    // 连接打印机
    async connect(deviceName = null, deviceMac = null) {
        try {
            console.log('正在连接蓝牙打印机...');
            
            // 请求蓝牙设备
            const options = {
                acceptAllDevices: false,
                optionalServices: [
                    '000018f0-0000-1000-8000-00805f9b34fb',  // 通用打印服务
                    '00001101-0000-1000-8000-00805f9b34fb',  // SPP服务
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455'   // Nordic UART
                ],
                filters: []
            };
            
            if (deviceName) {
                options.filters.push({ name: deviceName });
            }
            
            this.device = await navigator.bluetooth.requestDevice(options);
            console.log('选择设备:', this.device.name);
            
            // 监听断开连接
            this.device.addEventListener('gattserverdisconnected', () => {
                this.isConnected = false;
                console.log('蓝牙打印机已断开连接');
            });
            
            // 连接到GATT服务器
            this.server = await this.device.gatt.connect();
            console.log('GATT连接成功');
            
            // 尝试获取服务
            const services = await this.server.getPrimaryServices();
            console.log('发现服务数量:', services.length);
            
            // 尝试查找打印服务
            for (const service of services) {
                console.log(`服务: ${service.uuid}`);
                
                // 检查是否是已知的打印服务
                if (this.isPrintService(service.uuid)) {
                    this.service = service;
                    break;
                }
            }
            
            if (!this.service) {
                this.service = services[0]; // 使用第一个服务
                console.log('使用默认服务:', this.service.uuid);
            }
            
            // 获取特征
            const characteristics = await this.service.getCharacteristics();
            console.log('发现特征数量:', characteristics.length);
            
            for (const char of characteristics) {
                console.log(`特征: ${char.uuid} - 属性: ${char.properties.toString()}`);
                
                // 查找可写入的特征
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    this.characteristic = char;
                    break;
                }
            }
            
            if (!this.characteristic) {
                throw new Error('未找到可写入的特征');
            }
            
            // 检测打印机类型
            await this.detectPrinterType();
            
            this.isConnected = true;
            console.log(`打印机连接成功，类型: ${this.printerType}`);
            
            return true;
            
        } catch (error) {
            console.error('连接打印机失败:', error);
            throw error;
        }
    }
    
    // 检查是否为打印服务
    isPrintService(uuid) {
        const printServices = [
            '000018f0-0000-1000-8000-00805f9b34fb',  // 通用打印
            '00001101-0000-1000-8000-00805f9b34fb',  // SPP
            '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // Nordic UART
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2',  // BLE UART
            '0000ff00-0000-1000-8000-00805f9b34fb',  // 芯烨
            '0000fff0-0000-1000-8000-00805f9b34fb'   // 其他打印服务
        ];
        
        return printServices.some(serviceUuid => 
            uuid.toLowerCase().includes(serviceUuid.substring(4, 8))
        );
    }
    
    // 检测打印机类型
    async detectPrinterType() {
        try {
            // 发送ESC/POS初始化命令
            const initCommand = new Uint8Array([0x1B, 0x40]); // ESC @
            
            // 尝试获取打印机信息
            const statusCommand = new Uint8Array([0x10, 0x04, 0x01]);
            
            // 根据响应判断打印机类型
            // 这里简化处理，实际需要根据打印机型号调整
            if (this.device.name) {
                const name = this.device.name.toLowerCase();
                
                if (name.includes('gp-') || name.includes('gprinter') || name.includes('佳博')) {
                    this.printerType = 'gprinter';
                } else if (name.includes('hm-') || name.includes('hmprinter') || name.includes('汉印')) {
                    this.printerType = 'hmprinter';
                } else if (name.includes('niimbot') || name.includes('精臣')) {
                    this.printerType = 'niimbot';
                } else if (name.includes('xprinter') || name.includes('芯烨')) {
                    this.printerType = 'xprinter';
                } else if (name.includes('zebra')) {
                    this.printerType = 'zebra';
                } else {
                    this.printerType = 'escpos'; // 默认ESC/POS
                }
            } else {
                this.printerType = 'escpos';
            }
            
            console.log(`检测到打印机类型: ${this.printerType}`);
            return this.printerType;
            
        } catch (error) {
            console.warn('打印机类型检测失败，使用默认ESC/POS:', error);
            this.printerType = 'escpos';
            return 'escpos';
        }
    }
    
    // 断开连接
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristic = null;
        console.log('打印机已断开连接');
    }
    
    // 发送数据到打印机
    async sendData(data) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('打印机未连接');
        }
        
        try {
            // 将数据转换为Uint8Array
            let buffer;
            if (typeof data === 'string') {
                const encoder = new TextEncoder();
                buffer = encoder.encode(data);
            } else if (data instanceof Uint8Array) {
                buffer = data;
            } else if (Array.isArray(data)) {
                buffer = new Uint8Array(data);
            } else {
                throw new Error('不支持的打印数据类型');
            }
            
            // 根据特征属性选择写入方式
            if (this.characteristic.properties.write) {
                await this.characteristic.writeValue(buffer);
            } else if (this.characteristic.properties.writeWithoutResponse) {
                await this.characteristic.writeValueWithoutResponse(buffer);
            } else {
                throw new Error('特征不支持写入');
            }
            
            console.log(`数据发送成功，大小: ${buffer.length}字节`);
            return true;
            
        } catch (error) {
            console.error('发送数据失败:', error);
            throw error;
        }
    }
    
    // 打印文本
    async printText(text, options = {}) {
        const defaults = {
            fontSize: 'normal',  // normal, double, triple
            bold: false,
            align: 'left',       // left, center, right
            cut: true,           // 是否切纸
            feed: 3              // 进纸行数
        };
        
        const config = { ...defaults, ...options };
        let commands = [];
        
        // 初始化打印机
        commands.push(...this.getInitCommand());
        
        // 设置字体大小
        commands.push(...this.getFontSizeCommand(config.fontSize));
        
        // 设置粗体
        if (config.bold) {
            commands.push(...this.getBoldCommand(true));
        }
        
        // 设置对齐
        commands.push(...this.getAlignCommand(config.align));
        
        // 添加文本
        commands.push(...this.encodeText(text));
        
        // 取消粗体
        if (config.bold) {
            commands.push(...this.getBoldCommand(false));
        }
        
        // 进纸
        commands.push(...this.getFeedCommand(config.feed));
        
        // 切纸（如果有切纸功能）
        if (config.cut) {
            commands.push(...this.getCutCommand());
        }
        
        // 发送命令
        await this.sendData(new Uint8Array(commands.flat()));
    }
    
    // 打印库位码标签
    async printLocationLabel(locationCode, itemName = '', quantity = 1) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-CN');
        const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
        
        // 构建标签内容
        const labelContent = [
            '\x1B\x40', // 初始化
            '\x1B\x61\x01', // 居中
            '\x1D\x21\x11', // 双倍高度+宽度
            '库位码标签\n\n',
            
            '\x1D\x21\x00', // 恢复字体大小
            '\x1B\x61\x00', // 左对齐
            `库位码: ${locationCode}\n`,
            `商品: ${itemName}\n`,
            `数量: ${quantity}\n`,
            `日期: ${dateStr}\n`,
            `时间: ${timeStr}\n`,
            
            '\n\n', // 空行
            
            // 添加条码（Code128）
            '\x1B\x61\x01', // 居中
            ...this.generateBarcode(locationCode),
            '\n\n\n',
            
            '\x1B\x64\x03', // 进纸3行
            '\x1B\x69', // 全切纸（如果支持）
            '\x1B\x4D\x01' // 选择切纸模式
        ].join('');
        
        await this.printText(labelContent, { cut: true, feed: 5 });
    }
    
    // 生成Code128条码命令
    generateBarcode(text) {
        // 简化的Code128条码生成
        // 实际需要完整实现Code128编码
        const commands = [
            '\x1D\x68\x64', // 条码高度
            '\x1D\x77\x03', // 条码宽度
            '\x1D\x48\x02', // HRI字符位置（上方）
            '\x1D\x6B\x49', // Code128类型
            String.fromCharCode(text.length + 2), // 长度
            '\x7B\x42', // Code128起始符B
            text,
            '\x00' // 终止符
        ];
        
        return commands;
    }
    
    // ====== ESC/POS 命令生成 ======
    
    getInitCommand() {
        return [0x1B, 0x40]; // ESC @
    }
    
    getFontSizeCommand(size) {
        switch(size) {
            case 'double':
                return [0x1D, 0x21, 0x11]; // 双倍高度+宽度
            case 'triple':
                return [0x1D, 0x21, 0x22]; // 三倍高度+宽度
            default:
                return [0x1D, 0x21, 0x00]; // 正常大小
        }
    }
    
    getBoldCommand(enabled) {
        return enabled ? [0x1B, 0x45, 0x01] : [0x1B, 0x45, 0x00]; // ESC E
    }
    
    getAlignCommand(align) {
        switch(align) {
            case 'center':
                return [0x1B, 0x61, 0x01]; // ESC a 1
            case 'right':
                return [0x1B, 0x61, 0x02]; // ESC a 2
            default:
                return [0x1B, 0x61, 0x00]; // ESC a 0 (左对齐)
        }
    }
    
    getFeedCommand(lines) {
        return [0x1B, 0x64, lines]; // ESC d n
    }
    
    getCutCommand() {
        return [0x1D, 0x56, 0x00]; // GS V 0 (部分切纸)
    }
    
    encodeText(text) {
        const encoder = new TextEncoder();
        return Array.from(encoder.encode(text));
    }
    
    // ====== 打印机状态检查 ======
    
    async checkStatus() {
        try {
            // 发送状态查询命令
            const statusCommand = new Uint8Array([0x10, 0x04, 0x01]);
            
            if (this.characteristic.properties.read) {
                await this.characteristic.writeValue(statusCommand);
                const status = await this.characteristic.readValue();
                return this.parseStatus(status);
            }
            
            return { online: true, paper: true, error: false };
            
        } catch (error) {
            console.error('状态检查失败:', error);
            return { online: false, paper: false, error: true, message: error.message };
        }
    }
    
    parseStatus(statusBuffer) {
        // 解析打印机状态字节
        if (!statusBuffer || statusBuffer.byteLength === 0) {
            return { online: true, paper: true, error: false };
        }
        
        const statusByte = new Uint8Array(statusBuffer)[0];
        
        return {
            online: true,
            paper: !(statusByte & 0x04), // 位2：缺纸标志
            error: !!(statusByte & 0x08), // 位3：错误标志
            coverOpen: !!(statusByte & 0x20), // 位5：纸仓盖打开
            overHeat: !!(statusByte & 0x40), // 位6：过热
            rawStatus: statusByte
        };
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BluetoothPrinter;
} else {
    window.BluetoothPrinter = BluetoothPrinter;
}