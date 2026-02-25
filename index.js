const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    let browser;
    try {
        console.log("1. Xác thực Google Sheets...");
        let creds = process.env.GOOGLE_JSON ? JSON.parse(process.env.GOOGLE_JSON) : JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: creds.private_key.replace(/\\n/g, '\n'),
        });
        await doc.loadInfo();
        console.log("--- KẾT NỐI SHEET THÀNH CÔNG: " + doc.title);
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Khởi động trình duyệt...");
        browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ] 
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Giả lập như người dùng đang dùng Chrome thật trên Windows
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log("3. Truy cập TopCV...");
        // Đợi lâu hơn một chút (60s) để trang load hết các script bảo mật
        await page.goto('https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        console.log("- Đợi 10 giây cho trang render xong xuôi...");
        await new Promise(r => setTimeout(r, 10000));

        console.log("- Cuộn trang để kích hoạt dữ liệu...");
        await page.evaluate(async () => {
            window.scrollBy(0, 1000);
            await new Promise(r => setTimeout(r, 2000));
        });

        console.log("4. Đang bóc tách dữ liệu...");
        const jobs = await page.evaluate(() => {
            const results = [];
            // Tìm tất cả các link có chứa từ khóa tuyển dụng (cách bền vững nhất)
            const links = document.querySelectorAll('a[href*="/viec-lam/"]');
            
            links.forEach(link => {
                const title = link.innerText.trim();
                // Tìm thẻ cha chứa tên công ty (thường nằm gần đó)
                const container = link.closest('div[class*="job"]') || link.parentElement.parentElement;
                const company = container.innerText.split('\n').find(t => t.length > 5 && t !== title) || "Farmers Market Check";

                if (title.length > 15 && !results.some(r => r['Tiêu đề'] === title)) {
                    results.push({
                        'Tiêu đề': title,
                        'Công ty': company,
                        'Địa điểm': 'Hồ Chí Minh',
                        'Ngày quét': new Date().toLocaleString('vi-VN')
                    });
                }
            });
            return results;
        });

        if (jobs.length > 0) {
            console.log(`5. THÀNH CÔNG! Tìm thấy ${jobs.length} tin. Đang lưu...`);
            // Chỉ lấy 30 tin đầu cho nhẹ
            await sheet.addRows(jobs.slice(0, 30));
            console.log("--- DỮ LIỆU ĐÃ VỀ SHEET ---");
        } else {
            console.log("Cảnh báo: Vẫn không thấy tin. Chụp ảnh debug...");
            await page.screenshot({ path: 'debug.png' });
        }

    } catch (error) {
        console.error("Lỗi rồi Đạt ơi:", error.message);
    } finally {
        if (browser) await browser.close();
    }
}

startBot();
