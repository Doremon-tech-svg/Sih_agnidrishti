# AgniDrishti 3-Layer Enhancement: Total Timeline Estimate

---

## 📅 SEQUENTIAL IMPLEMENTATION (One Approach at a Time)

### **Total Sequential Time: 4-5 weeks**

#### **Week 1: FRP Forecasting (Prophet) — FASTEST & EASIEST**
**Duration:** 4-5 days  
**Effort:** Low (Prophet is library-based, minimal custom code)

```
Day 1-2: Environment Setup & Prototyping
  ├─ Install prophet package (pip install prophet)
  ├─ Write frp_prophet_forecaster.py (~200 lines)
  ├─ Test on 5 sample facilities
  └─ Time: 4-6 hours

Day 3: Express.js Integration
  ├─ Add /api/ml/forecast-frp endpoint
  ├─ Connect to database query for last 30 days FRP
  ├─ Test endpoint with curl/Postman
  └─ Time: 2-3 hours

Day 4: Risk Engine Integration
  ├─ Add forecast signal as new pillar in risk engine
  ├─ Combine forecast risk with existing risk score
  ├─ Update risk breakdown JSON structure
  └─ Time: 2-3 hours

Day 5: Testing & Documentation
  ├─ Unit tests for forecaster
  ├─ Test with all facilities
  ├─ Document API contract
  └─ Time: 2-3 hours

✅ READY FOR PRODUCTION
Total: 12-15 hours (1-2 days active work)
```

---

#### **Week 2-3: Autoencoder Anomaly Detection — MEDIUM COMPLEXITY**
**Duration:** 8-10 days  
**Effort:** Medium (requires training + deployment)

```
Day 1-2: Autoencoder Model Development
  ├─ Write FRPAutoencoder class (PyTorch) (~300 lines)
  ├─ Test on synthetic time-series data
  ├─ Verify loss convergence
  └─ Time: 8-10 hours

Day 3-4: Training Infrastructure
  ├─ Write train_all_facility_autoencoders.py (~150 lines)
  ├─ Query database for historical FRP per facility
  ├─ Test training on 10 facilities
  ├─ Measure training time per facility (usually 3-5 min CPU)
  └─ Time: 6-8 hours

Day 5-6: Batch Training ALL Facilities
  ├─ Run training on 100+ facilities (parallelize if possible)
  ├─ Monitor convergence, adjust hyperparameters if needed
  ├─ Save models to /models/autoencoder_facility_*.pt
  └─ Time: 4-8 hours (depends on parallelization)
    If serial: ~5-6 hours per 100 facilities on CPU
    If parallel (10 workers): ~30-45 min total

Day 7: Detector Integration
  ├─ Modify backend/app/anomaly/detector.py (~50 lines)
  ├─ Add autoencoder scoring alongside z-score
  ├─ Test hybrid anomaly detection
  └─ Time: 3-4 hours

Day 8: API Endpoint for Manual Scoring
  ├─ Add /api/ml/analyze-anomaly endpoint
  ├─ Allow real-time anomaly scoring on demand
  ├─ Connect to model loading logic
  └─ Time: 2-3 hours

Day 9-10: Testing & Validation
  ├─ Compare autoencoder scores vs z-score (side-by-side)
  ├─ Measure false-positive reduction
  ├─ Unit tests + integration tests
  └─ Time: 8-10 hours

✅ READY FOR PRODUCTION
Total: 40-50 hours (5-6 days active work)
```

**Note:** Most time is spent on training (parallelizable) and validation.

---

#### **Week 3-4: Sentinel-2 + CLIP Vision — MOST COMPLEX**
**Duration:** 8-10 days  
**Effort:** High (API integration + real-time imagery download)

```
Day 1-2: Sentinel-2 Downloader Module
  ├─ Research Copernicus SciHub API (free ESA satellite data)
  ├─ Write sentinel/downloader.py (~400 lines)
  ├─ Implement authentication + tile querying
  ├─ Test on 5 sample coordinates
  └─ Time: 10-12 hours

Day 3: Handle Failures & Caching
  ├─ Implement cloud-cover checking logic
  ├─ Add fallback to alternate tiles/dates
  ├─ Cache downloaded images locally
  └─ Time: 3-4 hours

Day 4-5: CLIP Vision Analyzer
  ├─ Write clip_analyzer.py using HuggingFace transformers (~250 lines)
  ├─ Download pretrained CLIP-ViT-B/32 model (~1.5GB, one-time)
  ├─ Define threat descriptions (text prompts)
  ├─ Test inference on downloaded imagery
  └─ Time: 6-8 hours

Day 6: Risk Engine Integration
  ├─ Add vision pillar to risk engine (~80 lines)
  ├─ Combine vision confidence with risk score
  ├─ Handle cases where image unavailable (graceful fallback)
  └─ Time: 3-4 hours

Day 7: Express.js Endpoint
  ├─ Add /api/ml/analyze-with-vision endpoint
  ├─ Orchestrate Sentinel-2 download + CLIP inference
  ├─ Return confidence + refined risk score
  └─ Time: 4-5 hours

Day 8-9: Error Handling & Optimization
  ├─ Handle satellite API outages
  ├─ Add GPU support for CLIP if available
  ├─ Implement async image processing (don't block hotspot processing)
  ├─ Caching strategy for repeated coordinates
  └─ Time: 8-10 hours

Day 10: Testing & Deployment
  ├─ End-to-end tests (hotspot → download → analyze → risk update)
  ├─ Verify S3/local caching works
  ├─ Performance benchmarking (image download time, inference latency)
  └─ Time: 6-8 hours

✅ READY FOR PRODUCTION
Total: 50-60 hours (6-7 days active work)
```

**Note:** Most complexity is handling satellite API latency and image fallbacks.

---

## 🚀 PARALLEL IMPLEMENTATION (Recommended)

### **Total Parallel Time: 2-3 weeks (RECOMMENDED)**

**Strategy:** Work on all three simultaneously with team rotation

```
WEEK 1: Setup Phase (All 3 in Parallel)
├─ Person A: Prophet forecasting (Days 1-5)
├─ Person B: Autoencoder + training (Days 1-6) 
├─ Person C: Sentinel-2 downloader (Days 1-5)
└─ Setup: Install dependencies, test database connectivity
  
  Output: 
    ✅ Prophet forecasting live in production
    ✅ 100+ facilities with trained autoencoders
    ⏳ Sentinel-2 downloader working (not integrated yet)

WEEK 2: Integration Phase (All 3 in Parallel)
├─ Person A: CLIP analyzer + risk engine integration
├─ Person B: Detector.py modification + testing
├─ Person C: Express.js endpoints for all 3
├─ QA: Side-by-side comparison testing
  
  Output:
    ✅ All 3 approaches live in production
    ✅ Risk engine combining all signals
    ✅ 3 new API endpoints functional

WEEK 3: Validation & Optimization
├─ Load testing (multiple concurrent requests)
├─ Accuracy benchmarking vs existing system
├─ Operator feedback collection
├─ Performance tuning (caching, parallelization)
  
  Output:
    ✅ Production-ready system
    ✅ Baseline metrics established
    ✅ Documentation complete

TOTAL: 15-21 days (2-3 weeks)
```

---

## 📊 TIME BREAKDOWN BY COMPONENT

### **Setup & Dependencies (Shared)**
| Task | Time |
|------|------|
| Environment setup (pip install packages) | 10-15 min |
| Database connectivity testing | 30 min |
| Git branch setup | 15 min |
| **Subtotal** | **~1 hour** |

### **FRP Forecasting (Prophet)**
| Phase | Time |
|-------|------|
| Code writing | 4-6 hours |
| Express integration | 2-3 hours |
| Risk engine integration | 2-3 hours |
| Testing & validation | 2-3 hours |
| **Subtotal** | **12-15 hours** |

### **Autoencoder Anomaly**
| Phase | Time |
|-------|------|
| Model code | 8-10 hours |
| Training infrastructure | 6-8 hours |
| Batch training (100 facilities) | 2-6 hours* |
| Detector integration | 3-4 hours |
| API endpoint | 2-3 hours |
| Testing & comparison | 8-10 hours |
| **Subtotal** | **30-45 hours** |

*Parallelizable: 2-6 hours serial → 30-45 min parallel (10 workers)

### **Sentinel-2 + CLIP Vision**
| Phase | Time |
|-------|------|
| Sentinel-2 downloader | 10-12 hours |
| Cloud cover handling | 3-4 hours |
| CLIP analyzer | 6-8 hours |
| Risk engine integration | 3-4 hours |
| Express endpoint | 4-5 hours |
| Error handling & caching | 8-10 hours |
| Testing & optimization | 6-8 hours |
| **Subtotal** | **40-55 hours** |

### **Cross-Cutting (All 3)**
| Task | Time |
|------|------|
| Unit tests | 4-6 hours |
| Integration tests | 4-6 hours |
| Documentation | 3-5 hours |
| Load testing & perf tuning | 4-6 hours |
| **Subtotal** | **15-23 hours** |

---

## 📈 REALISTIC TIMELINE ESTIMATES

### **Scenario 1: Single Developer (Sequential)**
```
Week 1 (Mon-Fri):   FRP Forecasting       → 3 days  (ready Tue EOD)
                    ✅ Live in production (Wed)

Week 2 (Mon-Fri):   Autoencoder          → 5 days  
                    - Training: Parallelizable, 
                      can run overnight
                    ✅ Live in production (Fri)

Week 3-4 (Mon-Fri): Vision + CLIP        → 6 days
                    - Sentinel API integration
                      takes most time
                    ✅ Live in production (Wed of Week 4)

TOTAL: ~3.5 weeks
```

### **Scenario 2: 2-Person Team (Staggered)**
```
Week 1 (Mon-Fri):   Person A: Prophet (3 days) ✅
                    Person B: Autoencoder setup (starts Wed)
                    
Week 2 (Mon-Fri):   Person A: CLIP Vision
                    Person B: Autoencoder training + testing
                    
Week 3 (Mon-Fri):   Both: Integration + testing of all 3
                    
                    All 3 ✅ Live in production (Fri)

TOTAL: ~2 weeks
```

### **Scenario 3: 3-Person Team (Fully Parallel)**
```
Day 1-2 (Mon-Tue):   Setup (everyone)
Day 3-5 (Wed-Fri):   All 3 in parallel
Week 2 (Mon-Fri):    Integration + testing
Week 3 (Mon-Fri):    Final validation + deployment

All 3 ✅ Live in production (Fri of Week 2)

TOTAL: ~10-12 business days (2 weeks)
```

---

## ⏱️ SUMMARY TABLE

| Approach | Dev Time | Training Time | Testing | Total | Notes |
|----------|----------|---------------|---------|-------|-------|
| **Prophet** | 6h | 5-10 min* | 3h | **~12-15h** | ⭐ Fastest |
| **Autoencoder** | 20h | 2-6h* | 8h | **~30-45h** | Parallelizable training |
| **CLIP Vision** | 30h | 0 (pretrained) | 8h | **~40-55h** | Most complex API |
| **All 3 (Sequential)** | 56h | 2-16h* | 19h | **~77-95h** | 3-4 weeks, 1 person |
| **All 3 (Parallel)** | 56h | 2-16h* | 19h | **~45-60h** | 2-3 weeks, 3 people |

*Can be parallelized on multiple machines/GPUs

---

## 🎯 RECOMMENDED APPROACH

### **Best Effort-to-Value Ratio: Parallel Implementation with 2-3 People**

**Timeline: 2-3 weeks to full production deployment**

```
Week 1: Setup + Prophet Live
  - Day 1-2: Environment setup, install dependencies
  - Day 3-5: Prophet forecasting complete & tested
  - Output: First enhancement live in production ✅

Week 2: Autoencoder + CLIP Integration
  - Parallel: Train autoencoders overnight (Person B)
  - Parallel: CLIP vision integration (Person C)
  - Person A: Risk engine enhancements + testing
  - Output: All 3 signals integrated, tested

Week 3: Production Hardening & Validation
  - Load testing, performance tuning
  - Operator feedback session
  - Final metrics collection
  - Output: Production-ready, fully documented ✅

TOTAL: 15 business days = 3 calendar weeks
```

---

## ⚙️ FACTORS AFFECTING TIMELINE

### **Accelerators (Save Time)**
- ✅ Team has GPU access → 10-20% faster training & inference
- ✅ Team is experienced with PyTorch/TensorFlow → skip learning curve (save 4-8h)
- ✅ Can run training overnight → parallelize with other work
- ✅ Using Prophet instead of LSTM → save 8-12 hours
- ✅ Existing Express.js & database skills → API endpoints faster

### **Decelerators (Add Time)**
- ⚠️ No GPU → Autoencoder training takes 2-3x longer
- ⚠️ Copernicus API requires registration + approval → add 24-48h wait
- ⚠️ Cloud cover frequently blocks Sentinel-2 → add error handling (8-10h)
- ⚠️ New team members → learning curve (add 8-16h)
- ⚠️ Production hardening requirements → add 8-12h

---

## 🏁 FINAL RECOMMENDATION

| Team Size | Timeline | Approach |
|-----------|----------|----------|
| **1 person** | 4-5 weeks | Sequential (Prophet → Autoencoder → CLIP) |
| **2 people** | 2-3 weeks | Staggered (1 on Prophet, 1 starts Autoencoder) |
| **3+ people** | 2 weeks | Fully parallel (each person: 1 approach + integration) |

**Our estimate for SIH deadline context:**
- **Minimum viable (Prophet only):** 1-2 weeks ✅ Quick win
- **Recommended (Prophet + Autoencoder):** 2-3 weeks ✅ Good coverage
- **Full enhancement (All 3):** 3-4 weeks ✅ Maximum impact

---

## 📋 GO / NO-GO CRITERIA FOR EACH WEEK

### **Week 1 Completion Criteria (Prophet)**
- [ ] `/api/ml/forecast-frp` endpoint working
- [ ] Forecasting 24-48 hours ahead for 5+ facilities
- [ ] Risk engine accepting forecast signal
- [ ] Tests passing, documented API

### **Week 2 Completion Criteria (Autoencoder)**
- [ ] 100+ facilities with trained autoencoders
- [ ] Anomaly scores lower than z-score false-positives
- [ ] `/api/ml/analyze-anomaly` endpoint working
- [ ] Side-by-side comparison metrics collected

### **Week 3 Completion Criteria (CLIP Vision)**
- [ ] `/api/ml/analyze-with-vision` endpoint working
- [ ] Sentinel-2 images downloading + CLIP analyzing
- [ ] Vision confidence improving risk scores
- [ ] Graceful fallback when satellite data unavailable

### **Week 3+ Completion (All Systems)**
- [ ] All 3 signals live in production
- [ ] Zero breaking changes to existing code
- [ ] Operator feedback positive (avg score >3/5)
- [ ] Documentation complete, team trained

