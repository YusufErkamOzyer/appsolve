# QuickCart 4 Core Services
services = [
  {
    name: "Giriş",
    name_en: "Authentication",
    slug: "auth",
    status: "operational",
    uptime_percentage: 99.99,
    description: "Kullanıcı kimlik doğrulama, oturum ve OAuth token yönetimi",
    metadata: {
      team: "Security & Identity",
      cluster: "auth-prod-eu1",
      latency_sla_ms: 150
    }
  },
  {
    name: "Katalog",
    name_en: "Product Catalog",
    slug: "catalog",
    status: "operational",
    uptime_percentage: 99.95,
    description: "Ürün listeleme, arama indeksi, stok ve fiyat sorgulama servisi",
    metadata: {
      team: "Discovery & Search",
      cluster: "catalog-prod-eu1",
      latency_sla_ms: 200
    }
  },
  {
    name: "Sepet",
    name_en: "Shopping Cart",
    slug: "cart",
    status: "operational",
    uptime_percentage: 99.98,
    description: "Kullanıcı sepet durumu, kupon/indirim hesaplama ve Redis oturum önbelleği",
    metadata: {
      team: "Cart & Promotions",
      cluster: "cart-redis-eu1",
      latency_sla_ms: 120
    }
  },
  {
    name: "Ödeme",
    name_en: "Checkout & Payment",
    slug: "checkout",
    status: "operational",
    uptime_percentage: 99.97,
    description: "Ödeme ağ geçidi, banka provizyonu ve sipariş tamamlama işlemleri",
    metadata: {
      team: "Transactions & Payments",
      cluster: "payments-prod-eu1",
      latency_sla_ms: 300
    }
  }
]

services.each do |attrs|
  service = Service.find_or_initialize_by(slug: attrs[:slug])
  service.update!(attrs)
end

puts "Seeded #{Service.count} core QuickCart services."
