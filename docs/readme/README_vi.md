<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <a href="README_ru.md">Русский</a> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <b>Tiếng Việt</b> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

Một giải pháp thay thế tự lưu trữ (self-hosted), đặt quyền riêng tư lên hàng đầu cho MyFitnessPal, Flo, Hevy, Shotsy và nhiều ứng dụng khác. Theo dõi dinh dưỡng, tập luyện, chỉ số cơ thể và dữ liệu sức khỏe trong khi vẫn toàn quyền kiểm soát dữ liệu của bạn.
<img width="5120" height="2880" alt="hình ảnh" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness là một nền tảng theo dõi thể chất tự lưu trữ, bao gồm:

- Một máy chủ backend (API + lưu trữ dữ liệu)
- Một giao diện frontend trên nền web
- Ứng dụng di động gốc cho iOS và Android

Nền tảng lưu trữ và quản lý dữ liệu sức khỏe trên hạ tầng do bạn kiểm soát, không phụ thuộc vào dịch vụ của bên thứ ba.

## Tính năng chính

- Theo dõi dinh dưỡng, tập luyện, lượng nước uống, giấc ngủ, nhịn ăn, tâm trạng và số đo cơ thể
- Đặt mục tiêu và check-in hằng ngày
- Biểu đồ tương tác và báo cáo dài hạn
- Nhiều hồ sơ người dùng và quyền truy cập cho gia đình
- Giao diện sáng và tối
- OIDC, TOTP, Passkey, MFA, v.v.

## So sánh SparkyFitness

**SparkyFitness là phần mềm công khai mã nguồn (source-available), không phải mã nguồn mở** — [giấy phép](../../LICENSE) chỉ cho phép sử dụng phi thương mại và cần được cấp phép đối với mục đích thương mại.

Hầu hết các ứng dụng chỉ làm một việc. Một ứng dụng dinh dưỡng tốt có giá 40–100 USD mỗi năm; để có đủ mọi thứ mà SparkyFitness cung cấp, bạn cần ba hoặc bốn gói đăng ký cho mỗi người, và vẫn không có một báo cáo chung nào cho tất cả. SparkyFitness làm được điều đó trong một ứng dụng duy nhất, miễn phí, cho cả gia đình.

<sub>Giá niêm yết tại Mỹ, ngày 14/08/2026. [Chi tiết chi phí đầy đủ →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Tự lưu trữ, dữ liệu vẫn thuộc về bạn | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Không đăng ký, không quảng cáo | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Dinh dưỡng, sức mạnh, giấc ngủ, nhịn ăn, chu kỳ và thuốc ở cùng một nơi\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Toàn bộ lịch sử và báo cáo theo khoảng thời gian tùy chọn | ✅ miễn phí | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Đồng bộ thiết bị đeo và nền tảng sức khỏe | ✅ 8+ dịch vụ | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Chia sẻ gia đình với phân quyền chi tiết | ⭐ 7 quyền | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Nhập CSV và xuất dữ liệu miễn phí | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Máy chủ MCP + dùng LLM của riêng bạn | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ nổi bật &nbsp;•&nbsp; ✅ được hỗ trợ &nbsp;•&nbsp; 🟡 một phần &nbsp;•&nbsp; 💰 chỉ gói trả phí &nbsp;•&nbsp; ❌ không hỗ trợ

<sub>\* Các giai đoạn giấc ngủ, HRV và đường huyết được nhập từ đồng hồ, điện thoại hoặc máy đo của bạn. SparkyFitness lưu trữ, phân tích và vẽ biểu đồ cho chúng chứ không tự đo.</sub>

> **Bảng này do chính dự án được so sánh viết, vì vậy hãy đọc với tinh thần đó.** Đã được kiểm tra vào ngày 14/08/2026 dựa trên tài liệu chính thức, kho mã nguồn và trang cửa hàng ứng dụng; một số thông tin có thể đã lỗi thời. Nếu một ô nào đó sai hoặc không công bằng với dự án khác, hãy [mở một issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — những đính chính khiến SparkyFitness trông *kém hơn* cũng được hoan nghênh như nhau.

**[Xem bảng so sánh đầy đủ →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 ứng dụng thuộc các nhóm tự lưu trữ, dinh dưỡng, chuyên biệt và hệ sinh thái thiết bị, cùng những điểm mà mỗi ứng dụng vượt trội hơn chúng tôi.

## Tích hợp sức khỏe và thiết bị

SparkyFitness có thể đồng bộ dữ liệu từ nhiều nền tảng sức khỏe và thể chất:

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava** (đã thử nghiệm một phần)
- **COROS**
- **Norish**
- **Yazio** (dùng API không chính thức)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

Các tích hợp tự động đồng bộ dữ liệu hoạt động như số bước, buổi tập và giấc ngủ, cùng với các chỉ số sức khỏe như cân nặng và số đo cơ thể, về máy chủ SparkyFitness của bạn.

## Tính năng AI tùy chọn (Beta)

SparkyAI cung cấp giao diện trò chuyện để ghi lại dữ liệu và xem lại tiến độ.

- Ghi lại thức ăn, bài tập, chỉ số cơ thể và số bước qua trò chuyện
- Tải lên ảnh món ăn để tự động ghi lại bữa ăn
- Lưu lịch sử trò chuyện để hỏi tiếp

Lưu ý: Các tính năng AI hiện đang trong giai đoạn beta.

## Cài đặt

Chọn một trong hai cách để chạy SparkyFitness:

### 1. Tự lưu trữ

Khởi chạy máy chủ SparkyFitness chỉ trong vài phút bằng Docker Compose:

```bash
# 1. Tạo một thư mục mới
mkdir sparkyfitness && cd sparkyfitness

# 2. Tải xuống docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Thiết lập cấu hình .env của bạn (Chọn một tùy chọn):
# Tùy chọn A (Khuyên dùng): Tạo .env tùy chỉnh với khóa bảo mật chỉ bằng 1 cú nhấp trong trình duyệt:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Tùy chọn B: Mẫu tối giản — 5 giá trị, mọi thứ khác dùng giá trị mặc định
# mà docker-compose đã áp dụng sẵn. Phù hợp với hầu hết các bản cài đặt tự lưu trữ.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Tùy chọn C: Tham chiếu đầy đủ — mọi biến được hỗ trợ, đều được chú thích kèm
# giá trị mặc định. Bắt đầu từ đây nếu dùng SSO, SMTP, cơ sở dữ liệu ngoài hoặc reverse proxy.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Thay thế các giá trị giữ chỗ (bỏ qua nếu bạn dùng Tùy chọn A — trình tạo
# đã điền sẵn). Máy chủ sẽ từ chối khởi động nếu chúng vẫn để nguyên,
# vì nếu không cơ sở dữ liệu sẽ được khởi tạo với một mật khẩu đã công khai.
#   SPARKY_FITNESS_DB_PASSWORD        một mật khẩu mạnh bất kỳ
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 ký tự hex)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 ký tự)
#   SPARKY_FITNESS_FRONTEND_URL       URL mà bạn sẽ dùng để mở ứng dụng

# 5. Khởi động ứng dụng
docker compose pull && docker compose up -d

# Truy cập ứng dụng tại http://localhost:3004
```

_Lưu ý: Để biết đầy đủ các tùy chọn cấu hình, reverse proxy và các phương thức cài đặt khác, hãy truy cập [Trang tài liệu](https://codewithcj.github.io/SparkyFitness/)._

### 2. Đám mây (dành cho người dùng không chuyên kỹ thuật)

Nếu bạn không phải người dùng kỹ thuật và không muốn chạy SparkyFitness trên máy chủ của riêng mình, bạn có thể triển khai một phiên bản được lưu trữ trên đám mây thông qua một trong các nhà cung cấp sau.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Chạy trên PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Triển khai với Zenith">
</a>


> **Lưu ý:** Đây là các dịch vụ độc lập của bên thứ ba. Chúng tôi khuyến khích bạn tìm hiểu các tính năng của từng nhà cung cấp để chọn ra dịch vụ phù hợp nhất với nhu cầu của mình.
 

## 🎥 Video hướng dẫn

[![Xem video](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Video hướng dẫn nhanh 2 phút về cách cài đặt SparkyFitness (ứng dụng theo dõi thể chất tự lưu trữ).

## Tài liệu

Để xem hướng dẫn cài đặt đầy đủ, các tùy chọn cấu hình và tài liệu phát triển, vui lòng truy cập [Trang tài liệu](https://codewithcj.github.io/SparkyFitness/) của chúng tôi.

### Liên kết nhanh

- **[Hướng dẫn cài đặt](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Triển khai và cấu hình
- **[Trình tạo .env tương tác](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Công cụ tạo cấu hình `.env` chạy phía trình duyệt
- **[Tổng quan tính năng](https://codewithcj.github.io/SparkyFitness/features)** - Tài liệu đầy đủ về các tính năng
- **[Quy trình phát triển](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Hướng dẫn cho nhà phát triển và quy trình đóng góp
- **[Thông tin ứng dụng iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** và **[Thông tin ứng dụng Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Cần trợ giúp?

- Đăng bài trong mục issues/discussions trên Github.
- Để được phản hồi nhanh hơn và nhận trợ giúp từ các thành viên khác trong cộng đồng, **[Tham gia Discord của chúng tôi](https://discord.gg/vcnMT5cPEA)**

## Lịch sử sao

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Biểu đồ lịch sử sao" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Bản dịch


**[Bản dịch trên Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Trạng thái bản dịch"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Trạng thái bản dịch" />
</a>

## Hoạt động của kho mã

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Hình ảnh phân tích Repobeats")

## Người đóng góp

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Những người đóng góp cho SparkyFitness"/>
</a>

## ⚠️ Vấn đề đã biết / Tính năng Beta ⚠️

SparkyFitness đang được phát triển tích cực.
Các thay đổi phá vỡ tương thích có thể xảy ra giữa các bản phát hành.

- Không khuyến khích tự động cập nhật container
- Luôn đọc ghi chú phát hành trước khi nâng cấp

Các tính năng sau hiện đang trong giai đoạn beta và có thể chưa được kiểm thử kỹ lưỡng. Hãy lường trước khả năng có lỗi hoặc chức năng chưa hoàn chỉnh:

- Chatbot AI
- Quyền truy cập cho Gia đình và Bạn bè
- Tài liệu API

_Đây là bản dịch của README tiếng Anh. Nếu có bất kỳ điểm nào khác biệt, [phiên bản tiếng Anh](../../README.md) là bản tham chiếu._
