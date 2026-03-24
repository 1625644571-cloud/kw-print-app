// 德佟P1打印机专用模块
class DetongP1Printer {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';  // 德佟P1服务UUID
        this.CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb'; // 写入特征UUID
    }
    
    // 连接德佟P1打印机
    async connect() {
        try {
            console.log('正在连接德佟P1打印机...');
            
            // 请求蓝牙设备
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: 'P1' },
                    { name: 'DETP1' },
                    { name: 'DetongP1' }
                ],
                optionalServices: [
                    this.SERVICE_UUID,
                    '000018f0-0000-1000-8000-00805f9b34fb',
                    '00001101-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455'
                ]
            });
            
            console.log('选择设备:', this.device.name);
            
            // 监听断开连接
            this.device.addEventListener('gattserverdisconnected', () => {
                this.isConnected = false;
                console.log('德佟P1打印机已断开连接');
            });
            
            // 连接到GATT服务器
            this.server = await this.device.gatt.connect();
            console.log('GATT连接成功');
            
            // 获取服务
            this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
            console.log('获取服务成功:', this.service.uuid);
            
            // 获取写入特征
            this.characteristic = await this.service.getCharacteristic(this.CHARACTERISTIC_UUID);
            console.log('获取特征成功:', this.characteristic.uuid);
            
            this.isConnected = true;
            console.log('德佟P1打印机连接成功');
            
            return true;
            
        } catch (error) {
            console.error('连接德佟P1失败:', error);
            throw error;
        }
    }
    
    // 断开连接
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        console.log('打印机已断开连接');
    }
    
    // 发送数据
    async sendData(data) {
        if (!this.isConnected || !this.characteristic) {
            throw new Error('打印机未连接');
        }
        
        try {
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
            
            await this.characteristic.writeValueWithoutResponse(buffer);
            console.log(`数据发送成功，大小: ${buffer.length}字节`);
            return true;
            
        } catch (error) {
            console.error('发送数据失败:', error);
            throw error;
        }
    }
    
    // 打印库位码标签
    async printLocationLabel(locationCode, itemName = '', quantity = 1) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('zh-CN');
        const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
        
        // 德佟P1标签打印命令
        const labelWidth = 60;  // 标签宽度（单位：点，根据实际标签调整）
        const labelHeight = 40; // 标签高度
        
        const commands = [
            // 初始化
            0x1B, 0x40,
            
            // 设置对齐方式为居中
            0x1B, 0x61, 0x01,
            
            // 设置字体大小（双倍高度+宽度）
            0x1D, 0x21, 0x11,
            
            // 打印标题
            ...this.encodeText('库位码标签\n\n'),
            
            // 恢复正常字体大小
            0x1D, 0x21, 0x00,
            
            // 设置对齐方式为左对齐
            0x1B, 0x61, 0x00,
            
            // 打印库位码（大号加粗）
            0x1B, 0x45, 0x01,  // 加粗
            0x1D, 0x21, 0x00,  // 正常大小
            ...this.encodeText(`库位码: ${locationCode}\n`),
            
            // 取消加粗
            0x1B, 0x45, 0x00,
            
            // 打印商品信息
            ...this.encodeText(`商品: ${itemName}\n`),
            ...this.encodeText(`数量: ${quantity}\n`),
            ...this.encodeText(`日期: ${dateStr}\n`),
            ...this.encodeText(`时间: ${timeStr}\n`),
            
            // 空行
            0x0A, 0x0A,
            
            // 居中对齐
            0x1B, 0x61, 0x01,
            
            // 打印条码（Code128）
            ...this.printBarcode(locationCode),
            
            // 空行
            0x0A, 0x0A, 0x0A,
            
            // 进纸并切纸
            0x1D, 0x56, 0x42, 0x00,  // 切纸
            0x1B, 0x64, 0x05  // 进纸5行
        ];
        
        console.log('开始打印库位码标签:', locationCode);
        await this.sendData(new Uint8Array(commands));
        console.log('打印完成');
    }
    
    // 打印条码（Code128）
    printBarcode(text) {
        // 德佟P1 Code128条码命令
        return [
            0x1D, 0x68, 0x64,    // 条码高度 100
            0x1D, 0x77, 0x03,    // 条码宽度 3
            0x1D, 0x48, 0x02,    // HRI字符位置（上方）
            0x1D, 0x66, 0x00,    // HRI字体（字体A）
            0x1D, 0x6B, 0x49,    // Code128类型
            text.length + 2,      // 数据长度
            0x7B, 0x42,          // Code128起始符B
            ...this.encodeText(text),
            0x00                  // 终止符
        ];
    }
    
    // 打印二维码
    async printQRCode(text, size = 8) {
        // 德佟P1二维码打印命令
        const qrCommands = [
            // 初始化
            0x1B, 0x40,
            
            // 设置二维码模型
            0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // 模型2
            
            // 设置二维码大小
            0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size,
            
            // 设置二维码纠错等级
            0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31, // 纠错等级L
            
            // 设置二维码数据
            const dataLength = text.length + 3;
            ...[0x1D, 0x28, 0x6B, dataLength % 256, Math.floor(dataLength / 256), 0x31, 0x50, 0x30],
            ...this.encodeText(text),
            
            // 打印二维码
            0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30
        ];
        
        await this.sendData(new Uint8Array(qrCommands));
    }
    
    // 打印测试标签
    async printTestLabel() {
        await this.printLocationLabel('TEST-01-01', '测试商品', 1);
    }
    
    // 打印批量标签
    async printBatchLabels(dataList) {
        for (const data of dataList) {
            await this.printLocationLabel(data.locationCode, data.itemName, data.quantity);
            // 打印间隔
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // 编码文本为字节数组
    encodeText(text) {
        // 使用GBK编码（中文编码）
        // 简化版：使用UTF-8，打印机需要支持
        const encoder = new TextEncoder();
        const buffer = encoder.encode(text);
        return Array.from(buffer);
    }
    
    // 检查打印机状态
    async checkStatus() {
        try {
            // 德佟P1状态查询命令
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
    
    // 解析状态
    parseStatus(statusBuffer) {
        if (!statusBuffer || statusBuffer.byteLength === 0) {
            return { online: true, paper: true, error: false };
        }
        
        const statusByte = new Uint8Array(statusBuffer)[0];
        
        return {
            online: true,
            paper: !(statusByte & 0x04),      // 缺纸标志
            error: !!(statusByte & 0x08),     // 错误标志
            coverOpen: !!(statusByte & 0x20),  // 纸仓盖打开
            overHeat: !!(statusByte & 0x40),  // 过热
            busy: !!(statusByte & 0x80),      // 打印中
            rawStatus: statusByte
        };
    }
    
    // 设置标签参数
    async setLabelParams(params) {
        const {
            width = 60,
            height = 40,
            density = 8,
            gap = 2
        } = params;
        
        const commands = [
            0x1D, 0x76, 0x30, 0x00,  // 设置标签尺寸
            width % 256, Math.floor(width / 256),
            height % 256, Math.floor(height / 256),
            
            0x1D, 0x76, 0x33, 0x00,  // 设置打印浓度
            density,
            
            0x1D, 0x76, 0x34, 0x00,  // 设置标签间隙
            gap % 256, Math.floor(gap / 256)
        ];
        
        await this.sendData(new Uint8Array(commands));
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DetongP1Printer;
} else {
    window.DetongP1Printer = DetongP1Printer;
}