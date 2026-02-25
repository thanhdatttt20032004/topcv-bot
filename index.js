const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// ID của Google Sheet ông đã chia sẻ quyền Editor cho Service Account
const SPREADSHEET_ID = process.env.SHEET_ID || '11xM2ti18lBRsMy6horr55eSVRFAYDgM6EPFw1UOxy0Q';

async function startBot() {
    try {
        console.log("1. Đang chuẩn bị xác thực Google Sheets...");
        let creds;
        
        if (process.env.GOOGLE_JSON) {
            creds = JSON.parse(process.env.GOOGLE_JSON);
        } else {
            creds = JSON.parse(fs.readFileSync('./goog.json', 'utf8'));
        }

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

        // Xử lý Private Key để tránh lỗi Signature
        const privateKey = creds.private_key.replace(/\\n/g, '\n');

        await doc.useServiceAccountAuth({
            client_email: creds.client_email,
            private_key: privateKey,
        });

        await doc.loadInfo();
        console.log("--- XÁC THỰC THÀNH CÔNG! Đã kết nối tới Sheet: " + doc.title);
        const sheet = doc.sheetsByIndex[0];

        console.log("2. Đang khởi động trình duyệt tàng hình (Puppeteer)...");
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1920,1080'
            ] 
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Giả lập người dùng thật
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log("3. Đang truy cập TopCV và chờ tải trang...");
        // Sử dụng URL tìm kiếm trực tiếp để có cấu trúc HTML ổn định hơn
        await page.goto('https://www.topcv.vn/tim-viec-lam-it-phan-mem-c10026', { 
            waitUntil: 'networkidle2', 
            timeout: 60000 
        });

        // Đợi một chút để trang ổn định và cuộn trang để load lazy-load
        console.log("- Đang cuộn trang để kích hoạt nạp tin...");
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 400;
                let timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if(totalHeight >= 3000){
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
            });
        });

        console.log("4. Đang bóc tách dữ liệu tin tuyển dụng...");
        const jobs = await page.evaluate(() => {
            // Nhắm vào các khung chứa tin phổ biến của TopCV
            const items = document.querySelectorAll('.job-item-2, .job-item-search-result, .job-item, [class*="job-item"]');
            
            return Array.from(items).map(item => {
                // Selector tiêu đề: Ưu tiên h3 a hoặc class title
                const titleEl = item.querySelector('h3 a, .title, .job-title, .title-job');
                // Selector công ty: Class company hoặc link dẫn tới trang công ty
                const companyEl = item.querySelector('.company, .company-name, .name-company, a[href*="/cong-ty/"]');
                // Selector địa điểm: Các thẻ chứa địa chỉ
                const addressEl = item.querySelector('.address, .location, .city, .label-content');

                return {
                    'Tiêu đề': titleEl ? titleEl.innerText.trim() : '',
                    'Công ty': companyEl ? companyEl.innerText.trim() : '',
                    'Địa điểm': addressEl ? addressEl.innerText.trim() : '',
                    'Ngày quét': new Date().toLocaleString('vi-VN')
                };
            }).filter(j => j['Tiêu đề'] && j['Tiêu đề'].length > 5);
        });

        if (jobs.length > 0) {
            console.log(`5. Thành công! Tìm thấy ${jobs.length} tin. Đang lưu vào Google Sheet...`);
            // Thêm dữ liệu vào các dòng tiếp theo
            await sheet.addRows(jobs);
            console.log("--- HOÀN THÀNH! DỮ LIỆU ĐÃ ĐƯỢC GHI VÀO SHEET ---");
        } else {
            console.log("Cảnh báo: Không tìm thấy tin nào. Kiểm tra lại Selector.");
        }

        await browser.close();

    } catch (error) {
        console.error("Lỗi hệ thống Đạt ơi:", error.message);
        process.exit(1);
    }
}

startBot();