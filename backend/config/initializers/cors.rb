Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    allowed_origins = ENV.fetch("CORS_ORIGINS", "*").split(",").map(&:strip)
    if ENV["FRONTEND_URL"].present? && !allowed_origins.include?("*")
      allowed_origins << ENV["FRONTEND_URL"].strip
    end

    origins(*allowed_origins)

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
