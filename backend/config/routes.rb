Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      get "status_page", to: "status_page#show"
      resources :services, only: [:index, :show]
      resources :status_updates, only: [:index]
      resources :incidents, only: [:index, :show] do
        member do
          post :approve_plan
          post :reject_plan
          post :messages, to: "incidents#create_message"
          post "post_mortem/regenerate", to: "incidents#regenerate_post_mortem"
          get "post_mortem/export", to: "incidents#export_post_mortem"
        end
      end

      namespace :telemetry do
        post "signals", to: "signals#create"
      end

      post "system/reset", to: "system#reset"
    end
  end
end
