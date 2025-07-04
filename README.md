
<div align="right">
  <details>
    <summary >🌐 Language</summary>
    <div>
      <div align="right">
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=en">English</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=zh-CN">简体中文</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=zh-TW">繁體中文</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ja">日本語</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ko">한국어</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=hi">हिन्दी</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=th">ไทย</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=fr">Français</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=de">Deutsch</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=es">Español</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=it">Itapano</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ru">Русский</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=pt">Português</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=nl">Nederlands</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=pl">Polski</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ar">العربية</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=fa">فارسی</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=tr">Türkçe</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=vi">Tiếng Việt</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=id">Bahasa Indonesia</a></p>
      </div>
    </div>
  </details>
</div>

# SparkyFitness - Selfhosted alternative of MyFitnessPal

SparkyFitness is a comprehensive fitness tracking and management application designed to help users monitor their nutrition, exercise, and body measurements. It provides tools for daily progress tracking, goal setting, and insightful reports to support a healthy lifestyle.


## ✨ Features

### 🍎 Nutrition Tracking

* **Log your daily meals**
* **Create and manage custom foods and categories**
* **View summaries and analyze trends with interactive charts**

### 💪 Exercise Logging

* **Record your workouts**
* **Browse and search a comprehensive exercise database**
* **Track fitness progress over time**

### 💧 Water Intake Monitoring

* **Track daily hydration goals**
* **Simple, quick water logging**

### 📏 Body Measurements

* **Record body metrics** (e.g. weight, waist, arms)
* **Add custom measurement types**
* **Visualize progress through charts**

### 🎯 Goal Setting

* **Set and manage fitness and nutrition goals**
* **Track progress over time**

### 🗓️ Daily Check-Ins

* **Monitor daily activity**
* **Stay consistent with habit tracking**

### 🤖 AI Nutrition Coach (SparkyAI)

* **Log food, exercise, body stats, and steps via chat**
* **Upload food images to log meals automatically**
* **Includes chat history and personalized guidance**

### 🔒 User Authentication & Profiles

* **Secure login system**
* **Switch between user profiles**
* **Support for family access and management**

### 📊 Comprehensive Reports

* **Generate summaries for nutrition and body metrics**
* **Track long-term trends over weeks or months**

### 🎨 Customizable Themes

* **Switch between light and dark mode**
* **Designed with a minimal, distraction-free interface**

### Need Help?
* **Join discord**
  https://discord.gg/vcnMT5cPEA
* **Post in discussion**


![image](https://github.com/user-attachments/assets/ccc7f34e-a663-405f-a4d4-a9888c3197bc)


## 🚀 Getting Started

To get the SparkyFitness application running on your local machine, follow these steps:

### Prerequisites

*   **Supabase Project**: You will need a Supabase project set up.
    *   **Create a new project on Supabase**: Go to [Supabase](https://app.supabase.com/) and create a new project. (You can also try setting up a local Supabase project if preferred.)
    *   Obtain your Supabase Project URL and Anon Key from your project settings (API section).
    *   **Important Note on Supabase Authentication:** Update your URL Configuration in Supabase Authentication settings to match your domain. This is crucial for your domain to work and for receiving email invites for sign-up. Supabase offers extensive security features and third-party SSO options; configure them as per your project's needs.
    *   Automated DB deployment to Supabase doesn't work with IPV4 if you have free version with Supabase. So, you need to configure your Network to use IPV6 connection. Oherwise DB migration will fail and you will need to deplopy manually.       


    

### Installation

1.  **Configure Environment Variables:**
    Create a `.env` file under private folder. If you are using Portainer, directly create over there. 
    Add your Supabase credentials:
    ```
    VITE_SUPABASE_URL="YOUR_SUPABASE_PROJECT_URL"
    VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
    SUPABASE_PROJECT_REF="YOUR_SUPABASE_PROJECT_REF"    
    ```

2.  **Run with Docker Compose:**
    Pull the Docker images and start the services:
    ```sh
    docker compose pull
    docker compose up -d
    ```

3.  **Access the Application:**
    Once the services are up and running, access SparkyFitness in your web browser at:
    ```
    http://localhost:3000
    ```

4.  **AI Chatbot - Optional Configuration:**
    To enable the AI Chatbot's full functionality, including secure API key storage and database access, follow these steps:

    *   **Configure `AI_API_ENCRYPTION_KEY`:** Generate a secret in "Supabase -> Edge Functions" -> "Environment Variables". This key is used for encrypting your AI keys when it is stored within Supabase.

    *   **Generate `SUPABASE_ACCESS_TOKEN`:**
        1.  Access your Docker console.
        2.  Run `supabase login` and authenticate using the provided URL.
        3.  Retrieve the access token by running `cat ~/.supabase/access-token`.
        4.  Update your `docker-compose.yml` or Portainer configuration with this token to redeploy.
        5.  After redeployment, log in to SparkyFitness and configure the AI service with your preferred provider.
     

### Manul Deployment of DB & Functions to Supabase
**Method 1:  
**If you don't have IPV6 network connection enabled, DB migration will fail as Supabase's free verssion doesn't support IPV4 direct connection.

   1. Download latest release and unzip to your PC.
   2. Navigate to the project folder. Docker needs to be up & running.
   3. Run below commands. (functions deploy is needed only for AI configuration. If you don't need ChatBOT, you can skip it)
``
      supabase login  
      supabase link  
      supabase db push  
      supabase functions deploy chat   
``
Re-run Docker compose. Front end App will start working.

**Method 2:  
   1. Download latest release and unzip to your PC.  
   2. Navigate to the project folder.  
   3. Go to supabase/migrations. Copy the SQL statements and run them in Supabase-->Project-->SQL Editor one by one in ASC order.  
   4. [Optional] Do the same for supabase/functions/chat  if you require AI ChatBOT. Copy index.js and run it in Supabase-->Project-->Edge Function-->Deploy new function.  


