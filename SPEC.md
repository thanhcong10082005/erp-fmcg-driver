# SPEC.md — ERP-FMCG Driver App v8.2

## 1. Concept & Vision

Driver App là ứng dụng mobile-first dành cho tài xế FMCG, cho phép thao tác giao hàng nhanh chóng, chống gian lận, và hoạt động offline ở vùng mất sóng. Giao diện tối giản tối đa — 1 màn hình chỉ hiện đúng 3 nút bấm chính để tài xế dùng một tay khi đang lái xe. Thiên về thao tác nhanh, tối thiểu nhập liệu.

**Tech Stack:** React 18 + TypeScript + Vite + Dexie.js (offline SQLite) + React Router v6

---

## 2. Design Language

### Color Palette
- **Primary:** `#1E40AF` (blue-800) — header, primary buttons
- **Success/Deliver:** `#059669` (emerald-600) — nút GIAO ĐỦ
- **Warning/Partial:** `#D97706` (amber-600) — nút GIAO MỘT PHẦN
- **Danger/Fail:** `#DC2626` (red-600) — nút KHÔNG GIAO ĐƯỢC
- **Background:** `#F1F5F9` (slate-100)
- **Surface:** `#FFFFFF`
- **Text Primary:** `#0F172A` (slate-900)
- **Text Secondary:** `#64748B` (slate-500)
- **Border:** `#E2E8F0` (slate-200)

### Typography
- Font: `Inter` (Google Fonts) — fallback: `-apple-system, BlinkMacSystemFont, sans-serif`
- Scale: 12/14/16/18/24/32px
- Weight: 400 (body), 500 (label), 600 (heading), 700 (button)

### Spacing
- Base unit: 4px
- Common: 8, 12, 16, 20, 24, 32px

### Motion
- Transition: 150ms ease-out (buttons), 250ms ease-in-out (screens)
- Page transitions: slide horizontal

---

## 3. Project Structure

```
DRIVER-APP/
├── src/
│   ├── api/
│   │   └── apiClient.ts         # Axios instance + interceptors
│   ├── components/
│   │   ├── DeliveryCard.tsx     # Delivery point card
│   │   ├── SignaturePad.tsx      # E-signature canvas
│   │   ├── PaymentInput.tsx      # Cash/Transfer/Credit inputs
│   │   ├── QuantityAdjuster.tsx  # Product qty adjuster (- only)
│   │   ├── GPSGuard.tsx          # GPS validation guard overlay
│   │   ├── PhotoCapture.tsx      # Camera for damage proof
│   │   └── LoadingOverlay.tsx
│   ├── screens/
│   │   ├── LoginScreen.tsx       # Step 1a: Login
│   │   ├── HomeScreen.tsx        # Step 1b: Trip overview + start
│   │   ├── DeliveryListScreen.tsx # Step 2: List of stops + nav
│   │   ├── DeliveryCoreScreen.tsx # Step 3+4: Checkin guard + 3 buttons
│   │   ├── PartialDeliveryScreen.tsx # Step 4b: Partial delivery
│   │   ├── FailDeliveryScreen.tsx # Step 4c: Failed delivery
│   │   ├── PaymentScreen.tsx     # Step 5: Multi-method payment
│   │   └── EODScreen.tsx         # Step 6: End of day summary
│   ├── screens/DeliveryDetailScreen.tsx # Helper: order detail
│   ├── services/
│   │   ├── offlineDB.ts         # Dexie.js — local SQLite
│   │   ├── syncQueue.ts          # Background sync queue
│   │   ├── gpsService.ts         # Geolocation + distance calc
│   │   └── authService.ts        # Login + token mgmt
│   ├── store/
│   │   └── driverStore.ts        # Zustand store
│   ├── types/
│   │   └── index.ts              # All TypeScript interfaces
│   ├── utils/
│   │   ├── timeGuard.ts          # 5h-22h check
│   │   └── formatters.ts         # Currency, phone
│   ├── App.tsx                   # Router + providers
│   └── main.tsx                  # Entry point
├── package.json
├── vite.config.ts
├── tsconfig.json
└── SPEC.md
```

---

## 4. API Contracts

### Auth
```
POST /api/auth/dev-login   { user_id?: number; tenant_id?: string }
Response: { access_token, user: { user_id, full_name, phone, role_id, tenant_id, ... } }
```

### Master Data (for offline sync)
```
GET /api/partners?limit=10000
GET /api/products?limit=10000
```

### Trip (Driver's assigned trip)
```
GET /api/sales/trips?driver_id={user_id}&status=DELIVERING
GET /api/sales/trips/:id
Response: { trip_id, trip_number, status, total_orders, total_amount,
            started_at, orders: [{ trip_order_id, so_id, stop_order, status,
            partner_name, phone, address_line, total_amount, old_debt_amount,
            delivery_status }] }
```

### POD (Proof of Delivery)
```
POST /api/sales/pod
Body: {
  trip_order_id, so_id, partner_id,
  new_order_cash, new_order_transfer, new_order_credit,
  old_debt_cash, old_debt_transfer, old_debt_credit,
  total_collected, recipient_name, notes, signature_url
}
Response: { pod_id, ... }

PUT /api/sales/pod/:id
Body: { delivery_status, failure_reason, notes }
```

### Trip Completion
```
PUT /api/sales/trips/:id/complete
Response: { trip_id, status: 'COMPLETED' }
```

---

## 5. Luồng 6 Bước chi tiết

### Bước 1: Bắt đầu ca làm việc
- **LoginScreen**: Nhập SĐT hoặc mã định danh → Gọi `/api/auth/dev-login`
- Lưu token vào localStorage
- Gọi song song: GET `/partners` + GET `/products` → lưu vào Dexie.js
- Chuyển sang **HomeScreen**

- **HomeScreen**: Gọi `GET /trips?driver_id={user_id}&status=DELIVERING`
  - Nếu không có trip → thông báo "Không có chuyến xe được gán"
  - Hiển thị card: Mã xe, Tổng tải trọng, Tổng tiền dự kiến
  - Nút **"XUẤT PHÁT"** → `PUT /trips/:id/start` → `status: DELIVERING`
  - Chuyển sang **DeliveryListScreen**

### Bước 2: Danh sách điểm giao & Điều hướng
- **DeliveryListScreen**: Hiển thị danh sách orders theo `stop_order`
- Mỗi DeliveryCard: Tên KH, Địa chỉ, SĐT (tap-to-call), Tổng tiền, Công nợ cũ
- Nút "Bản đồ" → mở Google Maps: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
- Tap vào card → chuyển sang **DeliveryCoreScreen**

### Bước 3: GPS Check-in (Anti-fraud)
- Khi vào **DeliveryCoreScreen**, chạy ngầm 3 chốt:
  1. **Time-lock**: `if (hour < 5 || hour >= 22) → block + alert`
  2. **GPS Gate**: Lấy tọa độ hiện tại. So sánh với partner.latitude/longitude.
     - `distance > 100m` → làm mờ nút giao, hiện cảnh báo "Cần đến đúng vị trí giao hàng"
     - `distance <= 100m` → bật sáng nút giao
  3. **No Backdate**: Chỉ cho phép tạo POD với timestamp hiện tại

### Bước 4: Màn hình tác nghiệp "1 Màn - 3 Nút"
**GIAO ĐỦ** (màu xanh, ~90%):
- Tap → chuyển thẳng sang **PaymentScreen** (skip Bước 5a)

**GIAO MỘT PHẦN / CHỈNH SỬA** (màu cam, ~8%):
- Tap → mở **PartialDeliveryScreen**:
  - Danh sách sản phẩm, chỉ nút trừ (-)
  - Signature canvas (bắt buộc)
  - Camera chụp hàng rớt/lỗi (bắt buộc)
  - Sau khi submit → **PaymentScreen**

**KHÔNG GIAO ĐƯỢC / HỦY** (màu đỏ, ~2%):
- Tap → mở **FailDeliveryScreen**:
  - Chọn lý do (bắt buộc): Từ chối nhận / Thất lạc / Hẹn giao lại / Lý do khác
  - Camera chụp bằng chứng (bắt buộc)
  - Submit → cập nhật `delivery_status = 'FAILED'`, quay lại DeliveryList

### Bước 5: Thanh Toán Đa Hình Thức
- **PaymentScreen**: Hiển thị Tổng tiền đơn + Công nợ cũ
- 3 ô nhập: Tiền mặt | Chuyển khoản | Ghi nợ
- Validation: `cash + transfer + credit = total_required`
- Nút "XÁC NHẬN HOÀN THÀNH":
  - Tạo POD via API (online) hoặc queue (offline)
  - Cập nhật `delivery_status = 'DELIVERED'`
  - Quay lại **DeliveryListScreen**

### Bước 6: Hoàn thành chuyến & EOD Report
- Khi điểm giao cuối hoàn tất:
  - Nếu tất cả orders `DELIVERED` → `PUT /trips/:id/complete` → **EODScreen** (COMPLETED)
  - Nếu có orders `FAILED` → **EODScreen** (PARTIAL_DELIVERED)
- **EODScreen**: Tổng kết ca
  - Tổng tiền mặt thu được
  - Tổng chuyển khoản
  - Tổng hàng rớt (từ partial deliveries)
  - Nút "KẾT THÚC CA" → quay về LoginScreen

---

## 6. Offline Architecture

### Dexie.js Tables
- `partners` — full master data sync
- `products` — full master data sync
- `trips` — current trip
- `orders` — orders in current trip
- `pendingPods` — PODs queued for sync
- `syncLog` — sync history

### Sync Queue
1. Mỗi POD tạo → lưu vào Dexie `pendingPods` với `sync_status: 'pending'`
2. `SyncManager` chạy interval 30s khi online
3. POST từng POD lên server
4. Khi server confirm → xóa khỏi `pendingPods`, ghi vào `syncLog`
5. Conflict: last-write-wins (server timestamp)

### Connectivity Detection
- `navigator.onLine` + periodic health check `GET /api/health`
- UI hiện banner "Đang offline — dữ liệu sẽ đồng bộ khi có mạng"

---

## 7. Database Schema Reference (v6)

```sql
-- delivery_trips: trip_id, trip_number, status ('PREPARING','DELIVERING','COMPLETED'), driver_id
-- delivery_trip_orders: trip_order_id, trip_id, so_id, stop_order, status ('PENDING','DELIVERED','PARTIAL','FAILED')
-- delivery_pod: pod_id, trip_order_id, so_id, delivery_status, new_order_cash/transfer/credit, old_debt_cash/transfer/credit, total_collected, signature_url
-- partners: partner_id, partner_name, phone, address_line, latitude, longitude, current_debt, old_debt
-- sales_orders: so_id, so_number, total_amount, old_debt_amount, status
-- sales_order_items: so_item_id, so_id, product_id, quantity, unit_price, line_total
```
