Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :services, only: [:index, :show]
      resources :incidents, only: [:index, :show] do
        member do
          post :approve_plan
          post :reject_plan
        end
      end

      namespace :telemetry do
        post "signals", to: "signals#create"
      end

      post "system/reset", to: "system#reset"
    end
  end
end
