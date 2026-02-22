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
const EVENT_DATES = [
  { date: '3.14(토)', label: '3월 14일', key: '2026-03-14' },
  { date: '3.21(토)', label: '3월 21일', key: '2026-03-21' },
  { date: '3.28(토)', label: '3월 28일', key: '2026-03-28' },
  { date: '4.4(토)', label: '4월 4일', key: '2026-04-04' },
]

// Calendar highlight days: { month(0-indexed): [days] }
const EVENT_CALENDAR: Record<string, number[]> = {
  '2026-2': [14, 21, 28],  // March
  '2026-3': [4],            // April
}

const QNA_DATA = [
  { q: '혼자 참여해도 어색하지 않을까요?', a: '네, 신청자의 약 70~80%가 혼자 방문하십니다. 모든 분이 자연스럽게 대화에 참여하실 수 있도록 체계적인 로테이션 프로그램과 합석 매칭 시스템이 준비되어 있으니 걱정 없이 오셔도 됩니다.' },
  { q: '승인 기준은 무엇인가요?', a: 'MIDNIGHT IN SADANG은 파티의 품질과 참가자 간의 조화를 위해 선별제를 운영합니다. 외적인 분위기, 매너, 연령대 등 다양한 요소를 종합적으로 고려하여 승인 절차를 진행합니다. 승인되지 않으신 경우, 참가비는 100% 환불됩니다.' },
  { q: '나이 제한이 엄격한가요?', a: '남성 90년~04년생, 여성 92년~05년생 분들을 대상으로 운영하고 있습니다. 비슷한 연령대의 참가자들이 모여 공감대를 형성하고 깊이 있는 대화를 나누실 수 있도록 관리하고 있습니다.' },
  { q: '사진(프로필)은 어디에 사용되나요?', a: '신청 시 제출하신 사진은 본인 확인 및 승인 절차를 위한 용도로만 사용됩니다. 파티 종료 후 해당 정보는 안전하게 파기되니 안심하셔도 됩니다.' },
  { q: '환불 규정이 궁금합니다.', a: '파티의 특성상 인원 및 남녀 성비를 미리 확정해야 하므로, 행사 7일 전까지만 취소 및 환불이 가능합니다. 상세 환불 규정은 신청서 하단을 확인해 주세요.' },
]

function App() {
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [openQna, setOpenQna] = useState<number | null>(null)
  const [modal, setModal] = useState<'terms' | 'privacy' | 'refund' | 'registration' | null>(null)
  const [prevModal, setPrevModal] = useState<typeof modal>(null)
  const [heroLoaded, setHeroLoaded] = useState(false)

  // ===== Event Settings (from Supabase) =====
  const [eventSettings, setEventSettings] = useState<Record<string, { male_count: number; female_count: number; male_max: number; female_max: number }>>({})

  const fetchEventSettings = useCallback(async () => {
    try {
      const { data } = await supabase.from('event_settings').select('*')
      if (!data) return
      const settings: Record<string, { male_count: number; female_count: number; male_max: number; female_max: number }> = {}
      data.forEach(r => { settings[r.event_date] = r })
      setEventSettings(settings)
    } catch (e) { console.error('Failed to fetch event settings:', e) }
  }, [])

  useEffect(() => { fetchEventSettings() }, [fetchEventSettings])

  // ===== Registration Form State =====
  const [formData, setFormData] = useState({
    name: '', birthDate: '', gender: '' as '' | 'male' | 'female',
    eventDate: '',
    phone: '', location: '', job: '', height: '', weight: '',
    instagramId: '', noInstagram: false,
    charm: '', preferredStyle: '', participationType: '', referralSource: '',
    agreeAlcohol: false, agreeTerms: false, agreePrivacy: false, agreeRefund: false,
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

  // Open a legal modal from within the registration form (preserves form state)
  const openLegalFromForm = (target: 'terms' | 'privacy' | 'refund') => {
    setPrevModal('registration')
    setModal(target)
  }

  // Close current modal (returns to previous if opened from form)
  const closeModal = () => {
    if (prevModal) {
      setModal(prevModal)
      setPrevModal(null)
    } else {
      setModal(null)
    }
  }

  // Reset form on modal open (cleanup old previews to free memory)
  const openRegistration = () => {
    if (bodyPreview) URL.revokeObjectURL(bodyPreview)
    if (facePreview) URL.revokeObjectURL(facePreview)
    setFormData({ name: '', birthDate: '', gender: '', eventDate: '', phone: '', location: '', job: '', height: '', weight: '', instagramId: '', noInstagram: false, charm: '', preferredStyle: '', participationType: '', referralSource: '', agreeAlcohol: false, agreeTerms: false, agreePrivacy: false, agreeRefund: false })
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
    if (!formData.eventDate) errors.eventDate = '참가 희망 날짜를 선택해주세요'
    if (!formData.birthDate || formData.birthDate.length !== 8) {
      errors.birthDate = '생년월일 8자리를 입력해주세요'
    } else {
      const y = parseInt(formData.birthDate.slice(0, 4))
      const m = parseInt(formData.birthDate.slice(4, 6))
      const d = parseInt(formData.birthDate.slice(6, 8))
      if (y < 1980 || y > 2010 || m < 1 || m > 12 || d < 1 || d > 31) {
        errors.birthDate = '올바른 생년월일을 입력해주세요'
      } else if (formData.gender === 'male' && (y < 1990 || y > 2004)) {
        errors.birthDate = '남성은 90~04년생만 신청 가능합니다'
      } else if (formData.gender === 'female' && (y < 1992 || y > 2005)) {
        errors.birthDate = '여성은 92~05년생만 신청 가능합니다'
      }
    }
    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) errors.phone = '올바른 연락처를 입력해주세요'
    if (!formData.location.trim()) errors.location = '거주지를 입력해주세요'
    if (!formData.job.trim()) errors.job = '직업을 입력해주세요'
    if (!formData.height.trim()) errors.height = '키를 입력해주세요'
    if (!formData.weight.trim()) errors.weight = '몸무게를 입력해주세요'
    if (!formData.noInstagram && !formData.instagramId.trim()) errors.instagramId = '인스타 ID를 입력하거나 "없음"을 선택해주세요'
    if (!formData.participationType) errors.participationType = '참여 구분을 선택해주세요'
    if (!bodyPhoto) errors.bodyPhoto = '전신 사진을 업로드해주세요'
    if (!facePhoto) errors.facePhoto = '얼굴 사진을 업로드해주세요'
    if (!formData.agreeAlcohol) errors.agreeAlcohol = '주류 대리구매 동의는 필수입니다'
    if (!formData.agreeTerms) errors.agreeTerms = '파티 이용 규정 동의는 필수입니다'
    if (!formData.agreePrivacy) errors.agreePrivacy = '개인정보 수집 동의는 필수입니다'
    if (!formData.agreeRefund) errors.agreeRefund = '취소 및 환불 규정 동의는 필수입니다'
    return errors
  }

  // Form submission
  const handleSubmit = async () => {
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      setTimeout(() => {
        const modal = document.querySelector('.modal-form')
        if (modal) modal.scrollTo({ top: modal.scrollHeight, behavior: 'smooth' })
      }, 50)
      return
    }
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
        birth_date: `${formData.birthDate.slice(0,4)}-${formData.birthDate.slice(4,6)}-${formData.birthDate.slice(6,8)}`,
        gender: formData.gender,
        event_date: formData.eventDate,
        phone: formData.phone.replace(/\D/g, ''),
        location: formData.location.trim(),
        job: formData.job.trim(),
        height: formData.height.trim(),
        weight: formData.weight.trim(),
        instagram_id: formData.noInstagram ? '없음' : formData.instagramId.trim(),
        charm: formData.charm.trim(),
        preferred_style: formData.preferredStyle.trim(),
        participation_type: formData.participationType,
        referral_source: formData.referralSource.trim(),
        body_photo_url: bodyUrl,
        face_photo_url: faceUrl,
        sms_sent: false,
      })
      if (error) throw error
      setSubmitSuccess(true)
    } catch (err: any) {
      console.error('Registration failed:', err)
      const msg = err?.message?.includes('column')
        ? '서버 설정 오류입니다. 관리자에게 문의해주세요.'
        : '신청 중 오류가 발생했습니다. 다시 시도해주세요.'
      setFormErrors({ submit: msg })
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
  const timetable2Ref = useStaggerReveal()
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
        <p className="hero-tagline hero-anim" style={{ animationDelay: '0.2s' }}>2030 프리미엄 솔로 파티 | 외모 승인제 | 대화 중심</p>
        <h1 className="hero-brand hero-anim" style={{ animationDelay: '0.5s' }}>MIDNIGHT IN SADANG</h1>
        <p className="hero-description hero-anim" style={{ animationDelay: '0.8s' }}>
          당신의 설렘이 시작되는 곳
        </p>
        <p className="hero-sub hero-anim" style={{ animationDelay: '1.0s' }}>
          엄선된 사람들과 함께하는 특별한 밤
        </p>
        <div className="hero-scroll hero-anim" style={{ animationDelay: '1.3s' }}>SCROLL</div>
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
              const eventDays = EVENT_CALENDAR[`${calYear}-${calMonth}`] || []
              const hasEvent = eventDays.includes(day)
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
          {EVENT_DATES.map((ev, i) => {
            const s = eventSettings[ev.key] || { male_count: 0, female_count: 0, male_max: 24, female_max: 24 }
            const totalCurrent = s.male_count + s.female_count
            const totalMax = s.male_max + s.female_max
            const malePercent = s.male_max > 0 ? (s.male_count / s.male_max) * 100 : 0
            const femalePercent = s.female_max > 0 ? (s.female_count / s.female_max) * 100 : 0
            const isFull = s.male_count >= s.male_max && s.female_count >= s.female_max
            return (
              <div key={i} className="event-item">
                <div className="event-top">
                  <span className={`event-badge ${isFull ? 'closed' : 'open'}`}>
                    {isFull ? '마감' : '모집중'}
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
                      <div className="gauge-fill male" style={{ width: `${Math.min(malePercent, 100)}%` }} />
                    </div>
                    <span className="gauge-count">{s.male_count}/{s.male_max}</span>
                  </div>
                  <div className="event-gauge-row">
                    <span className="gauge-label female">여</span>
                    <div className="gauge-bar">
                      <div className="gauge-fill female" style={{ width: `${Math.min(femalePercent, 100)}%` }} />
                    </div>
                    <span className="gauge-count">{s.female_count}/{s.female_max}</span>
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
        <p className="intro-description">
          의미 없는 게임과 시끄러운 소음에 지치진 않으셨나요?<br /><br />
          미드나잇 파티는 억지 텐션을 덜어내고<br />
          서로의 대화에만 집중하도록 준비했습니다.
        </p>

        <div className="intro-cards" ref={introRef}>
          <div className="intro-card stagger-child">
            <div className="intro-card-number">01</div>
            <h3>Selected Beauty</h3>
            <h4 className="intro-card-label">외모 승인제</h4>
            <p>
              외적 스타일과 어우러지는 분위기까지
              세심한 승인제로 검증된 만남을 보장합니다.
            </p>
          </div>
          <div className="intro-card stagger-child">
            <div className="intro-card-number">02</div>
            <h3>Deep Connection</h3>
            <h4 className="intro-card-label">깊은 대화</h4>
            <p>
              'Total Rotation'을 통한 새로운 만남
              'Focus Rotation'을 통한 눈맞춤 대화
              밀도 있는 대화에 온전히 몰입해 보세요.
            </p>
          </div>
          <div className="intro-card stagger-child">
            <div className="intro-card-number">03</div>
            <h3>Intentional Choice</h3>
            <h4 className="intro-card-label">선택</h4>
            <p>
              'Midnight Signal'로 호감 확인 후,
              'After Party'로 이어지는 대화.
              마음이 이끄는 인연을 직접 선택해보세요!
            </p>
          </div>
        </div>
      </section>

      {/* ===== 4-2. DETAILS ===== */}
      <section className="section details reveal-section" id="details" ref={detailsRef}>
        <h2 className="section-title">Details</h2>
        <p className="section-subtitle">파티 상세 정보</p>
        <div className="divider" />

        <div className="detail-table">
          <div className="detail-row">
            <div className="detail-label">파티 시간</div>
            <div className="detail-value">Main Party 21:00 ~ 00:30 / After Party 00:30 ~ 02:30</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">제공 사항</div>
            <div className="detail-value">핑거 푸드(안주류) / 소주, 맥주, 음료, 생수 무제한 제공</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">신분증</div>
            <div className="detail-value">본인 확인 및 연령 확인을 위한 신분증 지참 필수</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">참여 인원</div>
            <div className="detail-value">남녀 각 24명 ~ 40명 (승인 인원에 따라 상이)</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">참여 대상</div>
            <div className="detail-value">남성 90년생 ~ 04년생 / 여성 92년생 ~ 05년생</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Dress Code</div>
            <div className="detail-value">블랙 or 화이트 : 본인의 매력을 가장 잘 보여주는 스타일</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">참여비</div>
            <div className="detail-value">신청서 내 이벤트 특가를 확인해 주세요!</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">장소</div>
            <div className="detail-value">사당역 도보 5분 거리 (상세 주소 추후 개별문자 발송)</div>
          </div>
        </div>
      </section>

      {/* ===== 4-3. CONDITIONS ===== */}
      <section className="section" id="conditions">
        <h2 className="section-title">Who</h2>

        <div className="divider" />

        <p className="condition-description">
          단순한 만남을 넘어,<br />서로에게 기분 좋은 자극이 되어줄 분을 찾습니다.
        </p>

        <div className="condition-cards" ref={conditionsRef}>
          <div className="condition-card stagger-child">
            <div className="condition-number">01</div>
            <h4>나만의 스타일이<br />선명하신 분</h4>
            <p>자신을 멋지게 가꿀 줄 알고,<br />고유한 분위기를 가진 분을 선호합니다.</p>
          </div>
          <div className="condition-card stagger-child">
            <div className="condition-number">02</div>
            <h4>대화의 즐거움을<br />아시는 분</h4>
            <p>상대방의 이야기에 귀 기울이고,<br />자신의 생각을 조리 있게 나눌 줄 아는 분.</p>
          </div>
          <div className="condition-card stagger-child">
            <div className="condition-number">03</div>
            <h4>타인에 대한<br />매너와 존중</h4>
            <p>처음 만나는 사람에게 예의를 갖추고,<br />파티의 분위기를 함께 만들어갈 수 있는 분.</p>
          </div>
        </div>
      </section>

      {/* ===== 5. TIMETABLE ===== */}
      <section className="section timetable" id="timetable">
        <h2 className="section-title">Timetable</h2>
        <p className="section-subtitle">파티 진행 순서</p>
        <div className="divider" />

        <div className="timetable-part">
          <h3 className="timetable-part-title">Main Party : 21:00 ~ 00:30</h3>
          <div style={{ marginBottom: '32px' }} />
          <div className="timeline" ref={timetableRef}>
            <div className="timeline-item stagger-child">
              <div className="timeline-dot" />
              <div className="timeline-time">21:00 - 23:00</div>
              <div className="timeline-title">Deep Table Rotation</div>
              <div className="timeline-desc">[50분 대화 + 10분 휴식] 시스템으로 운영됩니다. 첫 만남의 어색함을 넘어 서로의 가치관과 취향을 깊이 있게 알아가는 4:4 그룹 다이닝 시간입니다.</div>
            </div>
            <div className="timeline-item stagger-child">
              <div className="timeline-dot" />
              <div className="timeline-time">23:00 - 23:30</div>
              <div className="timeline-title">Midnight Signal</div>
              <div className="timeline-desc">Main Party의 하이라이트! 마음에 머문 인연에게 당신의 시그널을 보내는 시간입니다. 용기 있는 선택이 새로운 시작을 만듭니다.</div>
            </div>
            <div className="timeline-item stagger-child">
              <div className="timeline-dot" />
              <div className="timeline-time">23:30 - 00:30</div>
              <div className="timeline-title">Impression & Final</div>
              <div className="timeline-desc">Main Party 마지막 테이블 대화. 못다 한 이야기는 After Party에서의 시간으로 이어집니다.</div>
            </div>
          </div>
        </div>

        <div className="timetable-part">
          <h3 className="timetable-part-title">After Party : 00:30 ~ 02:30</h3>
          <p className="timetable-part-desc">탐색의 시간이 지나고, 이제 당신의 직관이 움직일 차례입니다.</p>
          <div className="timeline" ref={timetable2Ref}>
            <div className="timeline-item stagger-child">
              <div className="timeline-dot" />
              <div className="timeline-time">00:30 - 00:40</div>
              <div className="timeline-title">The Midnight Choice</div>
              <div className="timeline-desc">Main Party에서 눈여겨본 인연을 향한 자유로운 자리 이동.</div>
            </div>
            <div className="timeline-item stagger-child">
              <div className="timeline-dot" />
              <div className="timeline-time">00:40 - 02:30</div>
              <div className="timeline-title">Midnight Lounge</div>
              <div className="timeline-desc">시간 제한 없는 깊은 몰입.<br />마음에 맞는 인연들과 Midnight Party를 온전히 즐기는 자유 네트워킹 시간.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 6. NOTICE ===== */}
      <section className="section" id="notice">
        <h2 className="section-title">Notice</h2>
        <p className="section-subtitle">즐거운 파티를 위해 꼭 확인해 주세요.</p>
        <div className="divider" />

        <div className="notice-list" ref={noticeRef}>
          <div className="notice-item stagger-child">
            <strong>01.</strong> <strong>신분증 지참 필수</strong><br />본인 확인을 위해 실물 신분증을 꼭 가져와 주세요.<br />(미지참 시 입장 및 환불이 어렵습니다.)
          </div>
          <div className="notice-item stagger-child">
            <strong>02.</strong> <strong>드레스코드 준수</strong><br />슬리퍼나 트레이닝복은 입장이 제한될 수 있어요.<br />당신의 매력을 가장 잘 보여줄 룩으로 만나요.
          </div>
          <div className="notice-item stagger-child">
            <strong>03.</strong> <strong>매너 가이드</strong><br />무례한 언행과 과도한 음주는 즉시 퇴장 조치됩니다.<br />매너가 매력의 시작임을 잊지 말아 주세요.
          </div>
          <div className="notice-item stagger-child">
            <strong>04.</strong> <strong>정확한 정보 입력</strong><br />신청 정보가 사실과 다를 경우 승인이 취소될 수 있습니다.
          </div>
          <div className="notice-item stagger-child">
            <strong>05.</strong> <strong>사진 촬영 안내</strong><br />현장 스케치 촬영 시 인물은 모두 블러 처리됩니다.<br />여러분의 소중한 프라이버시를 철저히 보호해 드려요.
          </div>
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
        <div className="divider" />

        <p className="contact-message">
          대부분 혼자, 그리고 처음입니다.<br />
          망설임 끝에 낸 작은 용기가<br />
          기분 좋은 인연으로 이어질 거예요.<br /><br />
          후회 없는 밤이 되도록<br />
          우리가 세심하게 준비하겠습니다.<br /><br />
          궁금한 점은 언제든 편하게 문의해 주세요.<br />
          MIDNIGHT IN SADANG에서 기다리겠습니다.
        </p>

        <div className="contact-icons">
          <a href="https://www.instagram.com/midnight_in_sadang?igsh=MW01ZHFzMmNiYzFjdQ%3D%3D" className="contact-icon" title="Instagram" target="_blank" rel="noopener noreferrer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
            </svg>
          </a>
        </div>
      </section>

      {/* ===== 9. FOOTER ===== */}
      <footer className="footer">
        <div className="footer-links">
          <span className="footer-link" onClick={() => setModal('terms')}>이용약관</span>
          <span className="footer-link" onClick={() => setModal('privacy')}>개인정보처리방침</span>
          <span className="footer-link" onClick={() => setModal('refund')}>취소 및 환불 규정</span>
        </div>
        <p className="footer-copy">&copy; 2026 MIDNIGHT IN SADANG. All rights reserved.</p>
      </footer>

      <div className="bottom-spacer" />

      {/* ===== FIXED APPLY BUTTON ===== */}
      <button className="apply-btn-fixed" onClick={openRegistration}>파티 신청하기</button>

      {/* ===== MODALS ===== */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className={`modal ${modal === 'registration' ? 'modal-form' : ''}`} onClick={e => e.stopPropagation()}>
            {modal === 'terms' ? (
              <div className="legal-content">
                <h2>이용약관</h2>

                <h3>제1조 (목적)</h3>
                <p>본 약관은 'MIDNIGHT IN SADANG'(이하 "사이트")이 제공하는 파티 중개 및 관련 서비스의 이용과 관련하여 사이트와 이용자 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.</p>

                <h3>제2조 (저작권 및 기획 자산의 보호)</h3>
                <ul>
                  <li>본 사이트에서 제공하는 모든 콘텐츠(텍스트, 로고, 파티 컨셉, 운영 로직, 타임테이블, 디자인 등)의 저작권 및 지식재산권은 'MIDNIGHT IN SADANG'에 귀속됩니다.</li>
                  <li>이용자는 주최 측의 사전 서면 동의 없이 본 사이트의 정보를 복제, 배포, 전송하거나 이를 모방하여 유사한 서비스를 제공하는 등 영리 목적으로 활용할 수 없습니다.</li>
                </ul>

                <h3>제3조 (서비스 이용 및 승인)</h3>
                <ul>
                  <li>본 서비스는 신청 후 주최 측의 승인 절차를 거쳐 참가 확정 여부가 결정되는 선별제 시스템으로 운영됩니다.</li>
                  <li>주최 측은 파티의 성격과 조화를 고려하여 승인 여부를 결정할 권한을 가지며, 미승인 시 사유를 별도로 고지하지 않을 수 있습니다.</li>
                </ul>

                <h3>제4조 (주류·음료 대리구매 사무 및 서비스 제공)</h3>
                <ul>
                  <li>본 파티의 참가비는 장소 대관료, 행사 기획 운영비, 기본 스낵 및 핑거푸드(안주류) 준비비로 구성되며, 주류 판매 대금은 포함되어 있지 않습니다.</li>
                  <li>사이트는 주류 판매업을 영위하지 않으며, 참가자의 편의를 위해 참가비를 활용하여 주류, 음료 및 생수를 일괄 대리구매하여 무상으로 제공하는 '대리구매 사무'를 수행합니다.</li>
                  <li>제공되는 주류 및 스낵류는 서비스의 일환이며, 참가자는 신청 시 이러한 운영 방식에 동의한 것으로 간주합니다.</li>
                  <li>모든 참가자는 과도한 음주를 자제할 의무가 있으며, 음주로 인한 사고 및 분쟁의 책임은 참가자 본인에게 있습니다. 미성년자 혹은 신분증 미지참자에게는 주류 제공이 절대 불가합니다.</li>
                </ul>

                <h3>제5조 (정보의 진실성 및 부정행위 책임)</h3>
                <ul>
                  <li>모든 참가자는 본인의 신원 정보(성명, 나이, 직업, 혼인 여부 등)를 사실에 근거하여 작성해야 합니다.</li>
                  <li>기혼자, 사진 도용, 정보 허위 기재 등 부정적인 방법으로 참여한 것이 적발될 경우 즉시 퇴장 조치되며, 납부한 참가비는 환불되지 않습니다.</li>
                  <li>위 항의 부정행위로 인하여 파티의 신뢰도를 실추시키거나 운영진 및 타 참가자에게 정신적·물질적 피해를 입힌 경우, 주최 측은 해당 참가자에게 민·형사상 법적 책임을 묻고 별도의 손해배상을 청구할 수 있습니다.</li>
                </ul>

                <h3>제6조 (매너 가이드 및 면책 조항)</h3>
                <ul>
                  <li>무례한 언행, 비동의 접촉/촬영 등 타인에게 불쾌감을 주는 행위 적발 시 즉시 퇴장 및 영구 제명됩니다.</li>
                  <li>사이트는 참가자가 직접 작성한 프로필 정보의 신뢰성에 대해 보증하지 않으며, 이로 인해 발생한 분쟁에 대해 책임을 지지 않습니다.</li>
                  <li>공식 프로그램 종료 이후 발생하는 참가자 간의 사적인 만남 및 사고에 대해서는 주최 측의 책임이 면제됩니다.</li>
                </ul>

                <button className="modal-close" onClick={closeModal}>닫기</button>
              </div>
            ) : modal === 'privacy' ? (
              <div className="legal-content">
                <h2>개인정보 처리방침</h2>

                <h3>제1조 (개인정보의 처리 목적)</h3>
                <p>'MIDNIGHT IN SADANG'은 다음의 목적을 위해 개인정보를 처리합니다.</p>
                <ul>
                  <li>파티 참가자 선별(승인제) 및 본인 확인</li>
                  <li>서비스 이용에 따른 공지사항 전달 및 매칭 시스템 운영</li>
                  <li>불량 이용자(허위 정보, 매너 위반자)의 재가입 방지 및 블랙리스트 관리</li>
                </ul>

                <h3>제2조 (처리하는 개인정보 항목)</h3>
                <ul>
                  <li><strong>필수항목:</strong> 성명, 성별, 생년월일, 연락처, 직업, 거주지, SNS 계정, 본인 확인용 사진</li>
                  <li><strong>자동수집항목:</strong> IP 주소, 쿠키, 서비스 이용 기록(방문 일시 등)</li>
                </ul>

                <h3>제3조 (개인정보의 처리 및 보유 기간)</h3>
                <ul>
                  <li>이용자의 개인정보는 서비스 이용일로부터 1년간 보존 후 파기합니다.</li>
                  <li>단, 관련 법령에 따른 보관이 필요하거나, 부정 이용(허위 기재, 성희롱 등)으로 제명된 회원의 정보는 재가입 차단 및 법적 대응을 위해 별도의 DB에 영구 보관될 수 있습니다.</li>
                </ul>

                <h3>제4조 (개인정보의 파기 절차 및 방법)</h3>
                <ul>
                  <li><strong>파기 절차:</strong> 보유 기간이 경과한 정보는 내부 방침에 따라 안전하게 삭제합니다.</li>
                  <li><strong>파기 방법:</strong> 전자적 파일 형태는 기록을 재생할 수 없도록 기술적 방법을 사용하여 삭제하며, 종이 문서는 분쇄하거나 소각합니다.</li>
                </ul>

                <h3>제5조 (개인정보 보호책임자)</h3>
                <p>사이트는 개인정보 처리에 관한 업무를 총괄해서 책임질 보호책임자를 아래와 같이 지정합니다.</p>
                <ul>
                  <li><strong>성명:</strong> MIDNIGHT IN SADANG 운영팀</li>
                  <li><strong>연락처:</strong> 카카오톡 채널 또는 인스타그램 DM</li>
                </ul>

                <button className="modal-close" onClick={closeModal}>닫기</button>
              </div>
            ) : modal === 'refund' ? (
              <div className="legal-content">
                <h2>취소 및 환불 규정</h2>

                <p className="legal-notice">본 서비스는 한정된 인원과 성비를 1:1로 매칭하여 운영되는 <strong>'예약제 특수 서비스 상품'</strong>입니다. 예약 확정 시점부터 해당 인원을 위한 대관 및 세팅이 진행되므로, 공정거래위원회 소비자분쟁해결기준을 준수하여 아래와 같은 환불 규정을 적용합니다.</p>

                <h3>환불 기준</h3>
                <ul>
                  <li><strong>행사 7일 전까지:</strong> 취소 시 100% 환불</li>
                  <li><strong>행사 6일 전 ~ 당일:</strong> 일정 변경 및 환불 절대 불가 (노쇼 및 타인 양도 불가)</li>
                </ul>

                <div className="legal-example">
                  <p><strong>환불 기준 예시</strong></p>
                  <p>파티일이 2월 21일(토)인 경우</p>
                  <ul>
                    <li>2월 14일(토) 23:59까지 취소 시 → 100% 환불 가능</li>
                    <li>2월 15일(일) 00:00부터 취소 시 → 환불 및 일정 변경 불가<br /><span className="legal-note">이는 개인 사정(질병, 사고, 업무 등)을 포함한 모든 경우에 해당합니다.</span></li>
                  </ul>
                </div>

                <h3>기타 환불 사항</h3>
                <ul>
                  <li><strong>미승인 환불:</strong> 주최 측의 선별 과정에서 승인이 거절된 경우, 입금액은 영업일 기준 48시간 이내 100% 환불됩니다.</li>
                  <li><strong>행사 취소:</strong> 주최 측 사정으로 행사가 취소될 경우 전액 환불됩니다.</li>
                </ul>

                <button className="modal-close" onClick={closeModal}>닫기</button>
              </div>
            ) : submitSuccess ? (
              <>
                <div className="form-success-icon">&#x2714;</div>
                <h2 className="form-success-title">Midnight in Sadang<br />신청서 작성 감사합니다.</h2>
                <p className="form-success-message"></p>
                <div className="form-success-info">
                  <h4>입금 및 승인 안내</h4>
                  <ul>
                    <li>신청 후 1시간 이내 본인계좌로 입금 시 심사가 시작됩니다.</li>
                    <li>카카오뱅크 0000-0000-0000 (000)</li>
                    <li>입금자명은 반드시 <strong>본인성함(핸드폰 뒷자리)</strong> 형태로 입력해 주세요.<br />(ex. 홍길동4885)</li>
                    <li>신청자명, 입금자명, 신분증 이름이 동일하지 않으면 입금 확인 및 입장이 어렵습니다.</li>
                    <li>최종 미승인 시 결제 금액은 100% 전액 환불됩니다.</li>
                  </ul>
                </div>
                <p className="form-success-note">
                  인연의 시작을 위해 이 화면을 캡처 후<br />승인 안내를 기다려 주세요.
                </p>
                <button className="modal-close" onClick={() => setModal(null)}>닫기</button>
              </>
            ) : (
              <>
                <h2>파티 참가 신청서</h2>
                <p className="form-subtitle">모든 항목을 정확히 입력해주세요</p>

                {/* 1. 성함 */}
                <div className="form-group">
                  <label className="form-label">성함 (실명) <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.name ? 'error' : ''}`}
                    placeholder="이름을 입력해주세요" value={formData.name}
                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
                  {formErrors.name && <p className="form-error">{formErrors.name}</p>}
                </div>

                {/* 2. 성별 */}
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

                {/* 2-1. 참가 희망 날짜 */}
                <div className="form-group">
                  <label className="form-label">참가 희망 날짜 <span className="required">*</span></label>
                  <div className="event-date-buttons">
                    {EVENT_DATES.map((ev) => (
                      <button key={ev.key} type="button"
                        className={`event-date-btn ${formData.eventDate === ev.key ? 'selected' : ''}`}
                        onClick={() => setFormData(p => ({ ...p, eventDate: ev.key }))}>
                        {ev.date}
                      </button>
                    ))}
                  </div>
                  {formData.eventDate && (() => {
                    const d = new Date(formData.eventDate)
                    const year = d.getFullYear()
                    const month = d.getMonth()
                    const days = getCalendarDays(year, month)
                    const selectedDay = d.getDate()
                    const eventDays = EVENT_CALENDAR[`${year}-${month}`] || []
                    return (
                      <div className="form-calendar">
                        <div className="form-calendar-header">{year}년 {month + 1}월</div>
                        <div className="form-calendar-grid">
                          {['일','월','화','수','목','금','토'].map(d => <div key={d} className="form-cal-label">{d}</div>)}
                          {days.map((day, i) => {
                            if (day === null) return <div key={`e${i}`} className="form-cal-day empty" />
                            const hasEvent = eventDays.includes(day)
                            const isSelected = day === selectedDay
                            return (
                              <div key={i}
                                className={['form-cal-day', hasEvent && 'has-event', isSelected && 'selected'].filter(Boolean).join(' ')}
                                onClick={() => hasEvent && setFormData(p => ({ ...p, eventDate: `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}` }))}>
                                {day}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}
                  {formErrors.eventDate && <p className="form-error">{formErrors.eventDate}</p>}
                </div>

                {/* 3. 생년월일 */}
                <div className="form-group">
                  <label className="form-label">생년월일 <span className="required">*</span></label>
                  <input type="text" inputMode="numeric" className={`form-input ${formErrors.birthDate ? 'error' : ''}`}
                    placeholder="예: 19990101" maxLength={8}
                    value={formData.birthDate}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                      setFormData(p => ({ ...p, birthDate: v }))
                    }} />
                  {formErrors.birthDate && <p className="form-error">{formErrors.birthDate}</p>}
                </div>

                {/* 4. 연락처 */}
                <div className="form-group">
                  <label className="form-label">연락처 <span className="required">*</span></label>
                  <input type="tel" className={`form-input ${formErrors.phone ? 'error' : ''}`}
                    placeholder="010-0000-0000" value={formData.phone}
                    onChange={e => setFormData(p => ({ ...p, phone: formatPhone(e.target.value) }))} />
                  {formErrors.phone && <p className="form-error">{formErrors.phone}</p>}
                </div>

                {/* 5. 거주지 */}
                <div className="form-group">
                  <label className="form-label">거주지 <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.location ? 'error' : ''}`}
                    placeholder="예: 서울시 동작구" value={formData.location}
                    onChange={e => setFormData(p => ({ ...p, location: e.target.value }))} />
                  {formErrors.location && <p className="form-error">{formErrors.location}</p>}
                </div>

                {/* 6. 직업 */}
                <div className="form-group">
                  <label className="form-label">직업 <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.job ? 'error' : ''}`}
                    placeholder="구체적으로 기재해주세요" value={formData.job}
                    onChange={e => setFormData(p => ({ ...p, job: e.target.value }))} />
                  <p className="form-hint">어떤 일을 하시는지 알려주시면 더욱 풍성한 대화가 가능하도록 참고하겠습니다</p>
                  {formErrors.job && <p className="form-error">{formErrors.job}</p>}
                </div>

                {/* 7. 키/몸무게 */}
                <div className="form-group">
                  <label className="form-label">키 / 몸무게 <span className="required">*</span></label>
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

                {/* 8. 인스타그램 ID */}
                <div className="form-group">
                  <label className="form-label">인스타그램 ID <span className="required">*</span></label>
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
                  <p className="form-hint">비공개 계정일 경우 신청기간 동안 공개로 전환 부탁드립니다.</p>
                  {formErrors.instagramId && <p className="form-error">{formErrors.instagramId}</p>}
                </div>

                {/* 9. 매력 포인트 */}
                <div className="form-group">
                  <label className="form-label">본인의 매력 포인트</label>
                  <textarea className="form-input form-textarea"
                    placeholder="키워드 3가지 혹은 1~2줄로 어필해주세요 (예: 성격이 밝음, 운동 좋아함, 자기관리 잘함)"
                    value={formData.charm}
                    onChange={e => setFormData(p => ({ ...p, charm: e.target.value }))} />
                </div>

                {/* 10. 선호하는 이성 스타일 */}
                <div className="form-group">
                  <label className="form-label">선호하는 이성 스타일</label>
                  <input type="text" className="form-input"
                    placeholder="간략하게 기재 (매칭 참고용)" value={formData.preferredStyle}
                    onChange={e => setFormData(p => ({ ...p, preferredStyle: e.target.value }))} />
                </div>

                {/* 11. 사진 */}
                <div className="form-group">
                  <label className="form-label">확인 및 선별용 사진 <span className="required">*</span></label>
                  <p className="form-hint">얼굴 1장 + 전신 1장 (얼굴이 선명하게 보이는 전신 혹은 상반신 사진 권장)<br />당신의 매력이 파티의 무드를 완성합니다. 정중한 선별을 위해 본인의 분위기가 잘 드러나는 사진을 공유해 주세요.</p>
                  <div className="form-photo-row">
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
                  </div>
                </div>

                {/* 12. 참여 구분 */}
                <div className="form-group">
                  <label className="form-label">참여 구분 <span className="required">*</span></label>
                  {!formData.gender ? (
                    <p className="form-hint">성별을 먼저 선택해주세요</p>
                  ) : (
                    <div className="participation-options">
                      {(formData.gender === 'male' ? [
                        { value: '1+2차', label: '1+2차 (21:00~02:30)', price: '59,900원' },
                        { value: '1부', label: '1부 (21:00~00:30)', price: '40,000원' },
                        { value: '2부', label: '2부 (00:30~02:30)', price: '35,000원' },
                      ] : [
                        { value: '1+2차', label: '1+2차 (21:00~02:30)', price: '55,000원' },
                        { value: '1부', label: '1부 (21:00~00:30)', price: '35,000원' },
                        { value: '2부', label: '2부 (00:30~02:30)', price: '30,000원' },
                      ]).map(opt => (
                        <label key={opt.value}
                          className={`participation-option ${formData.participationType === opt.value ? 'selected' : ''}`}
                          onClick={() => setFormData(p => ({ ...p, participationType: opt.value }))}>
                          <input type="radio" name="participationType" checked={formData.participationType === opt.value} readOnly />
                          <span className="participation-label">{opt.label}</span>
                          <span className="participation-price">{opt.price}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {formErrors.participationType && <p className="form-error">{formErrors.participationType}</p>}
                </div>

                {/* 13. 신청경로 */}
                <div className="form-group">
                  <label className="form-label">신청경로</label>
                  <select className="form-input form-select" value={formData.referralSource}
                    onChange={e => setFormData(p => ({ ...p, referralSource: e.target.value }))}>
                    <option value="">선택해주세요</option>
                    <option value="인스타그램 광고">인스타그램 광고</option>
                    <option value="지인 추천">지인 추천</option>
                    <option value="블로그">블로그</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                {/* ===== 동의 섹션 ===== */}
                <div className="form-divider" />

                {/* 13. 주류 대리구매 동의 */}
                <div className="form-group">
                  <label className="form-label">주류 대리구매 및 제공 동의 <span className="required">*</span></label>
                  <p className="form-hint">게스트분들의 편의를 위해 주류/음료/생수는 미드나잇인사당 측에서 일괄적으로 대리구매를 진행하고 있습니다. (제공되는 주류는 운영진의 대리구매를 통한 무상 서비스입니다.)</p>
                  <label className="form-agree">
                    <input type="checkbox" checked={formData.agreeAlcohol}
                      onChange={e => setFormData(p => ({ ...p, agreeAlcohol: e.target.checked }))} />
                    <span>참가비를 통한 주류 대리구매에 동의합니다</span>
                  </label>
                  {formErrors.agreeAlcohol && <p className="form-error">{formErrors.agreeAlcohol}</p>}
                </div>

                {/* 14. 파티 이용 규정 동의 */}
                <div className="form-group">
                  <label className="form-label">파티 이용 규정 및 약관 동의 <span className="required">*</span></label>
                  <div className="form-agree-link" onClick={() => openLegalFromForm('terms')}>이용약관 보기 &gt;</div>
                  <label className="form-agree">
                    <input type="checkbox" checked={formData.agreeTerms}
                      onChange={e => setFormData(p => ({ ...p, agreeTerms: e.target.checked }))} />
                    <span>파티 이용 규정에 동의합니다</span>
                  </label>
                  {formErrors.agreeTerms && <p className="form-error">{formErrors.agreeTerms}</p>}
                </div>

                {/* 15. 개인정보 동의 */}
                <div className="form-group">
                  <label className="form-label">개인정보 수집 및 이용 동의 <span className="required">*</span></label>
                  <div className="form-agree-link" onClick={() => openLegalFromForm('privacy')}>개인정보처리방침 보기 &gt;</div>
                  <label className="form-agree">
                    <input type="checkbox" checked={formData.agreePrivacy}
                      onChange={e => setFormData(p => ({ ...p, agreePrivacy: e.target.checked }))} />
                    <span>개인정보 수집 및 이용에 동의합니다</span>
                  </label>
                  {formErrors.agreePrivacy && <p className="form-error">{formErrors.agreePrivacy}</p>}
                </div>

                {/* 16. 환불 규정 동의 */}
                <div className="form-group">
                  <label className="form-label">취소 및 환불 규정 동의 <span className="required">*</span></label>
                  <div className="form-agree-link" onClick={() => openLegalFromForm('refund')}>취소 및 환불 규정 보기 &gt;</div>
                  <label className="form-agree">
                    <input type="checkbox" checked={formData.agreeRefund}
                      onChange={e => setFormData(p => ({ ...p, agreeRefund: e.target.checked }))} />
                    <span>취소 및 환불 규정을 확인하였으며 이에 동의합니다</span>
                  </label>
                  {formErrors.agreeRefund && <p className="form-error">{formErrors.agreeRefund}</p>}
                </div>

                {formErrors.submit && <p className="form-error form-submit-error">{formErrors.submit}</p>}

                <button className="form-submit-btn" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? '신청 중...' : '신청하기'}
                </button>

                {Object.keys(formErrors).filter(k => k !== 'submit').length > 0 && (
                  <div className="form-errors-summary" id="errors-summary">
                    <p>아래 항목을 확인해주세요:</p>
                    <ul>
                      {Object.entries(formErrors).filter(([k]) => k !== 'submit').map(([k, v]) => (
                        <li key={k}>{v}</li>
                      ))}
                    </ul>
                  </div>
                )}
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
