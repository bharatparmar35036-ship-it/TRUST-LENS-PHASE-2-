# TrustLens Live
### A Real-Time Trust Layer for the Internet
> Turning content into calculated credibility.
TrustLens Live is a real-time browser extension that analyzes selected content on any webpage and generates a dynamic Trust Score using a hybrid AI + rule-based verification engine.
Built during AI + Web Hackathon 2025.
---
## 🌍 The Problem
- Misinformation spreads **6x faster** than truth.
- **86%** of users struggle to identify fake news.
- No browser-native real-time verification layer exists.
Users are forced to manually fact-check, creating friction and slowing verification.
---
## 🚀 Our Solution
TrustLens Live integrates directly into the browser and enables:
Select Text → Analyze → Get Trust Score + Risk Classification + Explanation
Key Capabilities:
- Chrome Extension Integration
- Real-time analysis (< 2 seconds)
- Hybrid AI + Rule-based scoring
- Transparent Trust Score breakdown
- Risk classification (Verified / Questionable / Misleading)
---
## 🧠 System Architecture
End-to-End Workflow:
User selects text  
→ Chrome Extension sends request  
→ Node.js + Express backend  
→ Rule Engine (heuristic pattern analysis)  
→ AI Engine (Gemini API + Search Grounding)  
→ Hybrid Scoring Logic  
→ Trust Score + Risk Classification returned  
---
## 📊 Hybrid Scoring Model
TrustLens uses a weighted hybrid scoring approach:
finalScore = (ruleWeight × ruleScore) + (aiWeight × aiScore)
This ensures:
- AI-powered contextual understanding
- Rule-based fallback safety
- Transparent explainability
- Reliability even if AI fails or times out
Example (from demo):
Rule Score: 45  
AI Score: 75  
Final Score: 60  
Risk Level: Medium / Questionable  
--
## ⚙️ Technology Stack
### Frontend (Browser Extension)
- HTML5
- CSS3
- JavaScript
- Chrome Manifest V3
### Backend
- Node.js
- Express.js
- REST API Architecture
### AI & Verification Layer
- Gemini API (Claim Extraction & Analysis)
- Search Grounding (Live Web Verification)
### Optional Services
- Firebase (Authentication / Preferences)
---
## 🔥 Key Features
- Real-time credibility scoring
- Hybrid fallback system
- Pattern analysis breakdown
- Domain-based signal evaluation
- Transparent risk classification
- Seamless browser integration
- End-to-end working prototype
---
## 📈 Performance
- < 2 seconds average response time
- Real-time processing pipeline
- Working prototype demonstrated live
---
## 💼 Market Opportunity
- $12B global fact-checking market (projected)
- 5B+ internet users
- Freemium model
- B2B enterprise licensing potential
---
## 🛠 Installation (Development Setup)
### 1️⃣ Clone Repository
