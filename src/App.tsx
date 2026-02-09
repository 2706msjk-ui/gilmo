import { useState, useEffect, useRef, useCallback } from 'react'
import imageCompression from 'browser-image-compression'
import { supabase } from './supabase'
import './App.css'

// ===== Phone Formatter =====
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

// ===== Scroll Reveal Hook =====
function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('revealed'); observer.unobserve(el) } },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

// ===== Stagger Reveal Hook =====
function useStaggerReveal() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const children = el.querySelectorAll('.stagger-child')
          children.forEach((child, i) => {
            setTimeout(() => child.classList.add('revealed'), i * 120)
          })
          observer.unobserve(el)
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return ref
}

// ===== Calendar Helper =====
function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)
  return days
}

// ===== Sample Data =====
const EVENTS = [
  { date: '2.14(금) ~ 2.15(토)', label: '2월 14일', status: 'open' as const, male: { current: 12, max: 24 }, female: { current: 16, max: 24 } },
  { date: '2.21(금) ~ 2.22(토)', label: '2월 21일', status: 'open' as const, male: { current: 4, max: 24 }, female: { current: 9, max: 24 } },
  { date: '2.28(금) ~ 3.1(토)', label: '2월 28일', status: 'open' as const, male: { current: 0, max: 25 }, female: { current: 0, max: 25 } },
  { date: '2.7(금) ~ 2.8(토)', label: '2월 7일', status: 'closed' as const, male: { current: 24, max: 24 }, female: { current: 24, max: 24 } },
]

const EVENT_DAYS = [7, 8, 14, 15, 21, 22, 28]

const QNA_DATA = [
  { q: '술을 잘 못 마시는데 괜찮을까요?', a: '음료와 다과도 준비되어 있어 술을 드시지 않아도 즐기실 수 있고, 분위기와 네트워킹 중심 행사라 음료만 드셔도 충분히 즐기실 수 있습니다.' },
  { q: '혼자 가도 / 친구랑 가도 되나요?', a: '대부분 혼자 참여하시는 분들이지만 파티가 끝날 때엔 모두 친구가 되어 있어요! 친구랑 같이 오시면 2배 더 즐겁습니다.' },
  { q: '내향형 인간인데 잘 놀 수 있을까요?', a: '저희는 모두가 즐길 수 있는 적절한 텐션의 컨텐츠를 제공해드립니다. 파티 소셜링이 궁금하지만 쉽게 도전하지 못했던 분들께 적극 추천드려요!' },
  { q: '나이 제한이 있나요?', a: '남성은 93년 ~ 06년생, 여성은 93년 ~ 07년생까지 신청이 가능합니다. 주로 20대 초중반에서 20대 후반 신청자들이 가장 많습니다.' },
  { q: '드레스코드가 있나요?', a: '특별한 드레스코드는 없지만, 파티 분위기에 맞는 세미캐주얼 ~ 스마트캐주얼 복장을 권장합니다.' },
]

function App() {
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [openQna, setOpenQna] = useState<number | null>(null)
  const [modal, setModal] = useState<'terms' | 'privacy' | 'registration' | null>(null)
  const [heroLoaded, setHeroLoaded] = useState(false)

  // ===== Registration Form State =====
  const [formData, setFormData] = useState({
    name: '', birthDate: '', gender: '' as '' | 'male' | 'female',
    phone: '', instagramId: '', noInstagram: false, height: '', weight: '',
  })
  const [bodyPhoto, setBodyPhoto] = useState<File | null>(null)
  const [facePhoto, setFacePhoto] = useState<File | null>(null)
  const [bodyPreview, setBodyPreview] = useState('')
  const [facePreview, setFacePreview] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  // Body scroll lock when modal is open
  useEffect(() => {
    document.body.style.overflow = modal ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [modal])

  // Reset form on modal close
  const openRegistration = () => {
    setFormData({ name: '', birthDate: '', gender: '', phone: '', instagramId: '', noInstagram: false, height: '', weight: '' })
    setBodyPhoto(null); setFacePhoto(null)
    setBodyPreview(''); setFacePreview('')
    setFormErrors({}); setSubmitSuccess(false)
    setModal('registration')
  }

  // Form validation
  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formData.name.trim()) errors.name = '성함을 입력해주세요'
    if (!formData.gender) errors.gender = '성별을 선택해주세요'
    if (!formData.birthDate) errors.birthDate = '생년월일을 선택해주세요'
    if (formData.birthDate && formData.gender) {
      const y = parseInt(formData.birthDate.split('-')[0])
      if (formData.gender === 'male' && (y < 1993 || y > 2006)) errors.birthDate = '남성은 93~06년생만 신청 가능합니다'
      if (formData.gender === 'female' && (y < 1993 || y > 2007)) errors.birthDate = '여성은 93~07년생만 신청 가능합니다'
    }
    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) errors.phone = '올바른 연락처를 입력해주세요'
    if (!formData.noInstagram && !formData.instagramId.trim()) errors.instagramId = '인스타 ID를 입력하거나 "없음"을 선택해주세요'
    if (!formData.height.trim()) errors.height = '키를 입력해주세요'
    if (!formData.weight.trim()) errors.weight = '몸무게를 입력해주세요'
    if (!bodyPhoto) errors.bodyPhoto = '전신 사진을 업로드해주세요'
    if (!facePhoto) errors.facePhoto = '얼굴 사진을 업로드해주세요'
    return errors
  }

  // Form submission
  const handleSubmit = async () => {
    const errors = validateForm()
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    setSubmitting(true); setFormErrors({})

    try {
      const opts = { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true }
      const [compBody, compFace] = await Promise.all([
        imageCompression(bodyPhoto!, opts), imageCompression(facePhoto!, opts),
      ])

      const ts = Date.now()
      const ext = (f: File) => f.name.split('.').pop() || 'jpg'
      const [bodyUp, faceUp] = await Promise.all([
        supabase.storage.from('registrations').upload(`${ts}_body.${ext(compBody)}`, compBody),
        supabase.storage.from('registrations').upload(`${ts}_face.${ext(compFace)}`, compFace),
      ])
      if (bodyUp.error) throw bodyUp.error
      if (faceUp.error) throw faceUp.error

      const bodyUrl = supabase.storage.from('registrations').getPublicUrl(bodyUp.data.path).data.publicUrl
      const faceUrl = supabase.storage.from('registrations').getPublicUrl(faceUp.data.path).data.publicUrl

      const { error } = await supabase.from('registrations').insert({
        name: formData.name.trim(),
        birth_date: formData.birthDate,
        gender: formData.gender,
        phone: formData.phone.replace(/\D/g, ''),
        instagram_id: formData.noInstagram ? '없음' : formData.instagramId.trim(),
        height: formData.height.trim(),
        weight: formData.weight.trim(),
        body_photo_url: bodyUrl,
        face_photo_url: faceUrl,
        sms_sent: false,
      })
      if (error) throw error
      setSubmitSuccess(true)
    } catch (err: any) {
      console.error('Registration failed:', err)
      const detail = err?.message || err?.error_description || String(err)
      setFormErrors({ submit: `오류: ${detail}` })
    } finally {
      setSubmitting(false)
    }
  }

  const days = getCalendarDays(calYear, calMonth)
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토']

  // Scroll reveal refs
  const scheduleRef = useReveal()
  const introRef = useStaggerReveal()
  const detailsRef = useReveal()
  const conditionsRef = useStaggerReveal()
  const timetableRef = useStaggerReveal()
  const noticeRef = useStaggerReveal()
  const qnaRef = useReveal()
  const contactRef = useReveal()

  // Hero entrance animation
  useEffect(() => { const t = setTimeout(() => setHeroLoaded(true), 100); return () => clearTimeout(t) }, [])

  // Parallax on hero
  const heroRef = useRef<HTMLElement>(null)
  const onScroll = useCallback(() => {
    if (!heroRef.current) return
    const y = window.scrollY
    heroRef.current.style.backgroundPositionY = `${y * 0.4}px`
  }, [])
  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScroll])

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div className="app">

      {/* ===== 1. HERO / THEME ===== */}
      <section className={`hero ${heroLoaded ? 'hero-loaded' : ''}`} id="top" ref={heroRef}>
        <div className="hero-particles">
          {Array.from({ length: 20 }, (_, i) => (
            <span key={i} className="particle" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 6}s`,
              animationDuration: `${4 + Math.random() * 4}s`,
            }} />
          ))}
        </div>
        <p className="hero-tagline hero-anim" style={{ animationDelay: '0.2s' }}>PREMIUM SOCIAL GATHERING</p>
        <h1 className="hero-brand hero-anim" style={{ animationDelay: '0.5s' }}>GILMO'S PEOPLE</h1>
        <p className="hero-description hero-anim" style={{ animationDelay: '0.8s' }}>
          당신의 설렘이 시작되는 곳<br />
          엄선된 사람들과 함께하는 특별한 밤
        </p>
        <div className="hero-scroll hero-anim" style={{ animationDelay: '1.2s' }}>SCROLL</div>
      </section>

      {/* ===== 2. SCHEDULE ===== */}
      <section className="schedule reveal-section" id="schedule" ref={scheduleRef}>
        <h2 className="section-title">Schedule</h2>
        <p className="section-subtitle">파티 일정 및 참석 현황</p>

        <div className="calendar-wrapper">
          <div className="calendar-header">
            <button className="calendar-nav" onClick={prevMonth}>&lt;</button>
            <h3>{calYear}년 {calMonth + 1}월</h3>
            <button className="calendar-nav" onClick={nextMonth}>&gt;</button>
          </div>
          <div className="calendar-grid">
            {dayLabels.map(d => <div key={d} className="day-label">{d}</div>)}
            {days.map((day, i) => {
              if (day === null) return <div key={`e${i}`} className="calendar-day empty" />
              const isToday = calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate()
              const dayOfWeek = (i) % 7
              const hasEvent = calYear === 2026 && calMonth === 1 && EVENT_DAYS.includes(day)
              return (
                <div
                  key={i}
                  className={[
                    'calendar-day',
                    isToday && 'today',
                    dayOfWeek === 0 && 'sunday',
                    dayOfWeek === 6 && 'saturday',
                    hasEvent && 'has-event',
                  ].filter(Boolean).join(' ')}
                >
                  {day}
                </div>
              )
            })}
          </div>
        </div>

        <div className="event-list">
          {EVENTS.map((ev, i) => {
            const totalCurrent = ev.male.current + ev.female.current
            const totalMax = ev.male.max + ev.female.max
            const malePercent = ev.male.max > 0 ? (ev.male.current / ev.male.max) * 100 : 0
            const femalePercent = ev.female.max > 0 ? (ev.female.current / ev.female.max) * 100 : 0
            return (
              <div key={i} className="event-item">
                <div className="event-top">
                  <span className={`event-badge ${ev.status}`}>
                    {ev.status === 'open' ? '모집중' : '종료'}
                  </span>
                  <div className="event-info">
                    <div className="event-date">{ev.date}</div>
                    <div className="event-label">{ev.label}</div>
                  </div>
                  <div className="event-total">{totalCurrent}/{totalMax}명</div>
                </div>
                <div className="event-gauge-section">
                  <div className="event-gauge-row">
                    <span className="gauge-label male">남</span>
                    <div className="gauge-bar">
                      <div className="gauge-fill male" style={{ width: `${malePercent}%` }} />
                    </div>
                    <span className="gauge-count">{ev.male.current}/{ev.male.max}</span>
                  </div>
                  <div className="event-gauge-row">
                    <span className="gauge-label female">여</span>
                    <div className="gauge-bar">
                      <div className="gauge-fill female" style={{ width: `${femalePercent}%` }} />
                    </div>
                    <span className="gauge-count">{ev.female.current}/{ev.female.max}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ===== 4-1. PARTY INTRO ===== */}
      <section className="section" id="intro">
        <h2 className="section-title">About</h2>
        <p className="section-subtitle">GILMO'S PEOPLE은 이런 파티입니다</p>
        <div className="divider" />

        <div className="intro-cards" ref={introRef}>
          <div className="intro-card stagger-child">
            <div className="intro-card-icon">&#x2728;</div>
            <h3>감각적인 공간과 분위기</h3>
            <p>세련된 인테리어와 감각적인 조명이 만드는 특별한 공간에서 잊지 못할 밤을 선사합니다.</p>
          </div>
          <div className="intro-card stagger-child">
            <div className="intro-card-icon">&#x1F91D;</div>
            <h3>자연스러운 만남</h3>
            <p>어색함 없이 자연스럽게 어울릴 수 있는 다양한 프로그램과 컨텐츠로 새로운 인연을 만들어보세요.</p>
          </div>
          <div className="intro-card stagger-child">
            <div className="intro-card-icon">&#x1F3A4;</div>
            <h3>전문 MC 진행</h3>
            <p>경험 많은 전문 MC의 진행으로 처음 오시는 분들도 편하게 즐기실 수 있습니다.</p>
          </div>
        </div>
      </section>

      {/* ===== 4-2. DETAILS ===== */}
      <section className="section details reveal-section" id="details" ref={detailsRef}>
        <h2 className="section-title">Details</h2>
        <p className="section-subtitle">파티 제공 내용</p>
        <div className="divider" />

        <div className="detail-table">
          <div className="detail-row">
            <div className="detail-label">파티 시간</div>
            <div className="detail-value">1부: 20시 ~ 23시 / 2부: 23시 ~ 02시</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">제공 사항</div>
            <div className="detail-value">핑거 푸드 + 소주, 맥주, 물, 음료 무한 제공</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">인원</div>
            <div className="detail-value">24:24 ~ 45:45 (승인된 인원에 따라 상이)</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">남성</div>
            <div className="detail-value">93년생부터 06년생까지 참여 가능</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">여성</div>
            <div className="detail-value">93년생부터 07년생까지 참여 가능</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">참여비</div>
            <div className="detail-value">신청서에서 이벤트 가격 확인해주세요!</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">위치</div>
            <div className="detail-value">홍대입구역 도보 5분 거리 (상세 주소는 문자로 발송)</div>
          </div>
        </div>
      </section>

      {/* ===== 4-3. CONDITIONS ===== */}
      <section className="section" id="conditions">
        <h2 className="section-title">Who</h2>
        <p className="section-subtitle">이런 분들에게 추천해요!</p>
        <div className="divider" />

        <div className="condition-cards" ref={conditionsRef}>
          <div className="condition-card stagger-child">
            <div className="condition-number">01</div>
            <h4>새로운 인연을<br />만들고 싶은 솔로!</h4>
          </div>
          <div className="condition-card stagger-child">
            <div className="condition-number">02</div>
            <h4>하루를 마치고<br />설레고 싶은 누구나</h4>
          </div>
          <div className="condition-card stagger-child">
            <div className="condition-number">03</div>
            <h4>혼자라도 편하게<br />다양한 프로그램 구성</h4>
          </div>
        </div>

        <div className="condition-info">
          <div className="condition-info-item">
            <h4>&#x1F464; 나이 제한 있나요?</h4>
            <p>남성은 93년 ~ 06년생<br />여성은 93년 ~ 07년생까지 신청이 가능합니다.<br />주로 20대 초중반에서 20대 후반 신청자들이 가장 많습니다.</p>
          </div>
          <div className="condition-info-item">
            <h4>&#x270B; 입장 기준은 무엇인가요?</h4>
            <p>입금 확인 후, 모든 참가자분들께 최상의 경험과 특별한 순간을 선사하고자 세심한 선별과정을 거쳐 문자로 최종 안내를 드립니다.</p>
          </div>
        </div>
      </section>

      {/* ===== 5. TIMETABLE ===== */}
      <section className="section timetable" id="timetable">
        <h2 className="section-title">Timetable</h2>
        <p className="section-subtitle">파티 진행 순서</p>
        <div className="divider" />

        <div className="timeline" ref={timetableRef}>
          <div className="timeline-item stagger-child">
            <div className="timeline-dot" />
            <div className="timeline-time">20:30</div>
            <div className="timeline-title">파티 시작</div>
            <div className="timeline-desc">8시 10분부터 입장 가능합니다.</div>
          </div>
          <div className="timeline-item stagger-child">
            <div className="timeline-dot" />
            <div className="timeline-time">22:30</div>
            <div className="timeline-title">1부 컨텐츠 종료</div>
            <div className="timeline-desc">1부만 예약하셔도 현장 결제 가능합니다.</div>
          </div>
          <div className="timeline-item stagger-child">
            <div className="timeline-dot" />
            <div className="timeline-time">23:30</div>
            <div className="timeline-title">2부 파티 시작</div>
            <div className="timeline-desc">본 파티와 같은 장소에서 진행됩니다.</div>
          </div>
          <div className="timeline-item stagger-child">
            <div className="timeline-dot" />
            <div className="timeline-time">02:00</div>
            <div className="timeline-title">파티 종료</div>
            <div className="timeline-desc">순식간에 지나가는 특별한 시간.</div>
          </div>
        </div>
      </section>

      {/* ===== 6. NOTICE ===== */}
      <section className="section" id="notice">
        <h2 className="section-title">Notice</h2>
        <p className="section-subtitle">유의사항</p>
        <div className="divider" />

        <div className="notice-list" ref={noticeRef}>
          <div className="notice-item stagger-child">
            <strong>01.</strong> 시간 약속을 지켜주세요! 진행 시간에 맞춰 정시 입장을 부탁드립니다.
          </div>
          <div className="notice-item stagger-child">
            <strong>02.</strong> 성비 / 연령대 등 기타 사유로 인해 승인이 늦어 질 수 있습니다.
          </div>
          <div className="notice-item stagger-child">
            <strong>03.</strong> 행사 중 편의를 위해 간단한 다과, 음료와 주류가 무상으로 비치되어 있습니다. 참가비는 장소 대관 및 프로그램 운영비에 사용되며, 음식과 주류는 별도 비용 없이 제공됩니다.
          </div>
          <div className="notice-item stagger-child">
            <strong>04.</strong> 과한 스킨십, 불쾌한 언행 사용 시 <span className="warning">강제 퇴장</span>입니다. 이 때 참가비 환불은 <span className="warning">불가</span>합니다.
          </div>
        </div>

        <div className="notice-location">
          <h4>위치</h4>
          <p>홍대입구역 도보 5분 거리<br />(상세 주소는 승인 후 문자로 안내됩니다)</p>
        </div>
      </section>

      {/* ===== 7. QNA ===== */}
      <section className="section qna" id="qna">
        <h2 className="section-title">Q&A</h2>
        <p className="section-subtitle">자주 묻는 질문</p>
        <div className="divider" />

        <div className="qna-list reveal-section" ref={qnaRef}>
          {QNA_DATA.map((item, i) => (
            <div key={i} className={`qna-item ${openQna === i ? 'open' : ''}`}>
              <button className="qna-question" onClick={() => setOpenQna(openQna === i ? null : i)}>
                <div><span>Q.</span>{item.q}</div>
                <span className="qna-toggle">&#x25BC;</span>
              </button>
              <div className="qna-answer">
                <div className="qna-answer-inner">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 8. CONTACT ===== */}
      <section className="section contact reveal-section" id="contact" ref={contactRef}>
        <h2 className="section-title">Contact</h2>
        <p className="section-subtitle">문의처</p>
        <div className="divider" />

        <p className="contact-message">
          처음 오시는 분들이 대부분입니다.<br />
          찰나의 용기가 여러분들의 인생을 변화 시킵니다.<br />
          용기 내서 참여해 보세요. 후회 없는 시간 만들어드리겠습니다.<br /><br />
          언제든지 문의사항 있으시면 편하게 연락주세요 :)
        </p>

        <div className="contact-icons">
          <a href="#" className="contact-icon" title="Instagram" target="_blank" rel="noopener noreferrer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
            </svg>
          </a>
          <a href="#" className="contact-icon" title="KakaoTalk" target="_blank" rel="noopener noreferrer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3c-5.523 0-10 3.582-10 8 0 2.822 1.882 5.297 4.727 6.728-.209.783-.756 2.836-.866 3.272-.136.54.199.532.418.387.172-.114 2.742-1.862 3.862-2.621.598.088 1.216.134 1.859.134 5.523 0 10-3.582 10-8s-4.477-8-10-8z"/>
            </svg>
          </a>
          <a href="tel:010-0000-0000" className="contact-icon" title="Phone">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
            </svg>
          </a>
        </div>
      </section>

      {/* ===== 9. FOOTER ===== */}
      <footer className="footer">
        <div className="footer-links">
          <span className="footer-link" onClick={() => setModal('terms')}>이용약관</span>
          <span className="footer-link" onClick={() => setModal('privacy')}>개인정보처리방침</span>
        </div>
        <p className="footer-copy">&copy; 2026 GILMO'S PEOPLE. All rights reserved.</p>
      </footer>

      <div className="bottom-spacer" />

      {/* ===== FIXED APPLY BUTTON ===== */}
      <button className="apply-btn-fixed" onClick={openRegistration}>파티 신청하기</button>

      {/* ===== MODALS ===== */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className={`modal ${modal === 'registration' ? 'modal-form' : ''}`} onClick={e => e.stopPropagation()}>
            {modal === 'terms' ? (
              <>
                <h2>이용약관</h2>
                <p>제1조 (목적)<br />본 이용약관은 "GILMO'S PEOPLE"(이하 "사이트")의 서비스 이용조건과 운영에 관한 제반 사항 규정을 목적으로 합니다.</p>
                <p>제2조 (용어의 정의)<br />본 약관에서 사용되는 주요한 용어의 정의는 다음과 같습니다.<br />- 회원: 사이트의 약관에 동의하고 개인정보를 제공하여 회원등록을 한 자로서, 사이트와의 이용계약을 체결하고 사이트를 이용하는 이용자를 말합니다.<br />- 이용계약: 사이트 이용과 관련하여 사이트와 회원간에 체결하는 계약을 말합니다.</p>
                <p>제3조 (약관 외 준칙)<br />운영자는 필요한 경우 별도로 운영정책을 공지 안내할 수 있으며, 본 약관과 운영정책이 중첩될 경우 운영정책이 우선 적용됩니다.</p>
                <button className="modal-close" onClick={() => setModal(null)}>닫기</button>
              </>
            ) : modal === 'privacy' ? (
              <>
                <h2>개인정보처리방침</h2>
                <p>GILMO'S PEOPLE은 개인정보보호법에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.</p>
                <p>1. 개인정보의 수집 및 이용목적<br />회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.<br />- 서비스 제공에 관한 계약 이행 및 서비스 제공<br />- 회원 관리: 본인확인, 개인식별, 불량회원의 부정이용 방지</p>
                <p>2. 수집하는 개인정보의 항목<br />- 필수항목: 이름, 생년월일, 성별, 연락처, 인스타그램 ID<br />- 선택항목: 직업, 거주지역, 신체정보</p>
                <button className="modal-close" onClick={() => setModal(null)}>닫기</button>
              </>
            ) : submitSuccess ? (
              <>
                <div className="form-success-icon">&#x2714;</div>
                <h2 className="form-success-title">신청이 완료되었습니다!</h2>
                <p className="form-success-message">
                  관리자 확인 후 입금 안내 문자가 발송됩니다.<br />
                  문자가 오지 않을 경우 문의처로 연락해주세요.
                </p>
                <button className="modal-close" onClick={() => setModal(null)}>닫기</button>
              </>
            ) : (
              <>
                <h2>파티 신청서</h2>
                <p className="form-subtitle">모든 항목을 정확히 입력해주세요</p>

                <div className="form-group">
                  <label className="form-label">성함 <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.name ? 'error' : ''}`}
                    placeholder="이름을 입력해주세요" value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
                  {formErrors.name && <p className="form-error">{formErrors.name}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">성별 <span className="required">*</span></label>
                  <div className="form-radio-group">
                    <label className={`form-radio ${formData.gender === 'male' ? 'selected' : ''}`}>
                      <input type="radio" name="gender" checked={formData.gender === 'male'}
                        onChange={() => setFormData(p => ({ ...p, gender: 'male' }))} />
                      남성
                    </label>
                    <label className={`form-radio ${formData.gender === 'female' ? 'selected' : ''}`}>
                      <input type="radio" name="gender" checked={formData.gender === 'female'}
                        onChange={() => setFormData(p => ({ ...p, gender: 'female' }))} />
                      여성
                    </label>
                  </div>
                  {formErrors.gender && <p className="form-error">{formErrors.gender}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">생년월일 <span className="required">*</span></label>
                  <input type="date" className={`form-input ${formErrors.birthDate ? 'error' : ''}`}
                    value={formData.birthDate}
                    onChange={e => setFormData(p => ({ ...p, birthDate: e.target.value }))} />
                  {formErrors.birthDate && <p className="form-error">{formErrors.birthDate}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">연락처 <span className="required">*</span></label>
                  <input type="tel" className={`form-input ${formErrors.phone ? 'error' : ''}`}
                    placeholder="010-0000-0000" value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: formatPhone(e.target.value) }))} />
                  {formErrors.phone && <p className="form-error">{formErrors.phone}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">인스타 ID</label>
                  <div className="form-insta-row">
                    <input type="text" className={`form-input ${formErrors.instagramId ? 'error' : ''}`}
                      placeholder="@username" value={formData.instagramId} disabled={formData.noInstagram}
                      onChange={e => setFormData(p => ({ ...p, instagramId: e.target.value }))} />
                    <label className="form-checkbox">
                      <input type="checkbox" checked={formData.noInstagram}
                        onChange={e => setFormData(p => ({ ...p, noInstagram: e.target.checked, instagramId: '' }))} />
                      없음
                    </label>
                  </div>
                  {formErrors.instagramId && <p className="form-error">{formErrors.instagramId}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">신체정보 <span className="required">*</span></label>
                  <div className="form-body-row">
                    <div className="form-body-field">
                      <input type="number" className={`form-input ${formErrors.height ? 'error' : ''}`}
                        placeholder="키" value={formData.height}
                        onChange={e => setFormData(p => ({ ...p, height: e.target.value }))} />
                      <span className="form-unit">cm</span>
                    </div>
                    <div className="form-body-field">
                      <input type="number" className={`form-input ${formErrors.weight ? 'error' : ''}`}
                        placeholder="몸무게" value={formData.weight}
                        onChange={e => setFormData(p => ({ ...p, weight: e.target.value }))} />
                      <span className="form-unit">kg</span>
                    </div>
                  </div>
                  {(formErrors.height || formErrors.weight) && <p className="form-error">{formErrors.height || formErrors.weight}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">심사용 사진 <span className="required">*</span></label>
                  <p className="form-hint">전신 1장 + 얼굴 1장 (각 10MB 이하)</p>
                  <div className="form-photo-row">
                    <div className="form-photo-upload">
                      <label className={`form-photo-label ${formErrors.bodyPhoto ? 'error' : ''}`}>
                        {bodyPreview
                          ? <img src={bodyPreview} alt="전신" />
                          : <><span className="photo-icon">&#x1F4F7;</span><span>전신 사진</span></>}
                        <input type="file" accept="image/*" className="form-file-input"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { setBodyPhoto(f); setBodyPreview(URL.createObjectURL(f)) } }} />
                      </label>
                      {formErrors.bodyPhoto && <p className="form-error">{formErrors.bodyPhoto}</p>}
                    </div>
                    <div className="form-photo-upload">
                      <label className={`form-photo-label ${formErrors.facePhoto ? 'error' : ''}`}>
                        {facePreview
                          ? <img src={facePreview} alt="얼굴" />
                          : <><span className="photo-icon">&#x1F4F7;</span><span>얼굴 사진</span></>}
                        <input type="file" accept="image/*" className="form-file-input"
                          onChange={e => { const f = e.target.files?.[0]; if (f) { setFacePhoto(f); setFacePreview(URL.createObjectURL(f)) } }} />
                      </label>
                      {formErrors.facePhoto && <p className="form-error">{formErrors.facePhoto}</p>}
                    </div>
                  </div>
                </div>

                {formErrors.submit && <p className="form-error form-submit-error">{formErrors.submit}</p>}

                <button className="form-submit-btn" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '신청 중...' : '신청하기'}
                </button>
                <button className="modal-close" onClick={() => setModal(null)}>취소</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
