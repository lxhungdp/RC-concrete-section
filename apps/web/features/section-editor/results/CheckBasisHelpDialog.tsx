'use client'

import { useState } from 'react'
import { MovableDialog } from '../shared/MovableDialog'

const methods = [
  {
    title: '3D Load Ray',
    ray: 'λ(Pu, Mux, Muy)',
    ko: '원점에서 검토 하중점 (Pu, Mux, Muy)을 지나는 반직선을 그립니다. 설계강도 곡면을 이루는 각 삼각형의 평면과 교점을 구하고, 삼각형 위에 놓인 점만 남깁니다. 반직선 방향에서 원점과 가장 가까운 유효 교점의 하중계수가 λcap입니다.',
    en: 'Draw a ray from the origin through the checked load (Pu, Mux, Muy). Intersect the ray with the plane of each triangular face of the Design surface and keep points that lie within the triangle. The nearest valid hit ahead of the origin gives the capacity multiplier λcap.'
  },
  {
    title: '2D Load Ray',
    ray: 'λ(Pu, Mu)   ·   Mu = √(Mux² + Muy²)',
    ko: '하중조합의 중립축 방향을 고정하고, 그 방향으로 계산한 설계강도 점들을 P–MR 평면에 표시합니다. 각 점의 MR은 두 모멘트 성분의 합성 크기입니다. 원래 점들은 3차원에서 한 평면에 놓이지 않을 수 있으므로 이 곡선은 3차원 곡면의 평면 단면이 아닙니다. 원점에서 (Pu, Mu)을 지나는 반직선과 이 곡선의 교점에서 λ를 구합니다.',
    en: 'Fix the loadcase’s neutral-axis direction and plot its Design stations on P–MR, using the magnitude of the two moment components at each station. The original points may be noncoplanar in 3D. This curve is a collection of stations at one strain direction, rather than a plane cut of the surface. Find λ where the ray from the origin through (Pu, Mu) meets that curve.'
  },
  {
    title: 'Constant P',
    ray: '(Pu, λMux, λMuy)',
    ko: '축력을 Pu로 고정하고 3차원 설계강도 곡면을 P = Pu 평면으로 자릅니다. 그 평면에서 모멘트 원점부터 (Mux, Muy) 방향으로 진행하여 강도 경계와 만나는 λ를 구합니다. 이 UR은 Pu에서의 모멘트 사용률입니다.',
    en: 'Hold the axial force at Pu and cut the Design surface at P = Pu. In that plane, draw a ray from zero moment in the direction (Mux, Muy) to the resistance boundary. The ratio describes moment utilization at Pu.'
  }
] as const

function RaySketch({ index }: { index: number }) {
  return <svg viewBox="0 0 116 68" aria-hidden="true" className="pm-check-basis-sketch">
    <g fill="none" stroke="currentColor">
      <path d={index === 0 ? 'M60 5V35H108M60 35L25 63'
        : index === 1 ? 'M12 10V57H106' : 'M49 11V64M4 38H106'} />
      {index === 0 ? <><ellipse cx="60" cy="35" rx="36" ry="21" />
        <ellipse cx="60" cy="35" rx="16" ry="21" /><ellipse cx="60" cy="35" rx="36" ry="8" /></>
        : index === 1 ? <path d="M12 12 Q66 10 86 28 Q92 45 12 57" />
          : <ellipse cx="49" cy="38" rx="37" ry="17" />}
    </g>
    <path fill="none" stroke="var(--accent)" strokeWidth="2" d={index === 0 ? 'M60 35L96 35'
      : index === 1 ? 'M12 57L86 28' : 'M49 38L86 38'} />
    <circle fill="var(--accent)" cx={index === 0 ? 96 : 86} cy={index === 0 ? 35 : index === 1 ? 28 : 38} r="2.6" />
  </svg>
}

export function CheckBasisHelpDialog({ onClose }: { onClose: () => void }) {
  const [language, setLanguage] = useState<'ko' | 'en'>('ko')
  return <MovableDialog title={language === 'ko' ? '검토 방법' : 'Check methods'}
    className="pm-check-basis-help" onClose={onClose} actions={
    <div className="ws-joined-buttons" role="group" aria-label="Language">
      <button type="button" className="ws-action" aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>한국어</button>
      <button type="button" className="ws-action" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
    </div>
  }>
    <div className="pm-check-basis-help-content" lang={language}>
      {methods.map((method, index) => <section key={method.title}>
        <RaySketch index={index} />
        <div><h3>{method.title}</h3>
          <p className="ws-num">{method.ray}</p>
          <p>{method[language]}</p></div>
      </section>)}
      <p>{language === 'ko' ? '경계 교점에서 UR = 1 / λ입니다. 유효한 교점을 구할 수 없으면 UR을 표시하지 않습니다.'
        : 'At the capacity crossing, UR = 1 / λ. A ratio requires a qualified crossing.'}</p>
    </div>
  </MovableDialog>
}
