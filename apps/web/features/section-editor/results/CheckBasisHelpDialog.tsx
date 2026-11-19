'use client'

import { useState } from 'react'
import { MovableDialog } from '../shared/MovableDialog'

const methods = [
  {
    title: '3D Load Ray',
    sketch: 0,
    ray: 'λ(Pu, Mux, Muy)',
    ko: '원점에서 검토 하중점 (Pu, Mux, Muy)을 지나는 반직선을 그립니다. 설계강도 곡면을 이루는 각 삼각형의 평면과 교점을 구하고, 삼각형 위에 놓인 점만 남깁니다. 반직선 방향에서 원점과 가장 가까운 유효 교점의 하중계수가 λcap입니다.',
    en: 'Draw a ray from the origin through the checked load (Pu, Mux, Muy). Intersect the ray with the plane of each triangular face of the Design surface and keep points that lie within the triangle. The nearest valid hit ahead of the origin gives the capacity multiplier λcap.'
  },
  {
    title: 'Constant P',
    sketch: 2,
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
      {methods.map((method) => <section key={method.title}>
        <RaySketch index={method.sketch} />
        <div><h3>{method.title}</h3>
          <p className="ws-num">{method.ray}</p>
          <p>{method[language]}</p></div>
      </section>)}
      <p>{language === 'ko' ? '경계 교점에서 UR = 1 / λ입니다. 유효한 교점을 구할 수 없으면 UR을 표시하지 않습니다.'
        : 'At the capacity crossing, UR = 1 / λ. A ratio requires a qualified crossing.'}</p>
      <p>{language === 'ko'
        ? 'P–M 그래프는 하중 모멘트 방향 θ = atan2(Muy, Mux)의 연직 평면입니다. 각 점은 모멘트가 θ 방향이 되도록 중립축 각도를 따로 구한 실제 변형률 상태이므로 점마다 β가 다릅니다. 표시되는 β (N.A.), 단면 응력도와 σ–ε 점은 선택한 검토 방법의 강도점 상태입니다.'
        : 'The P–M chart is the vertical plane of the load moment direction θ = atan2(Muy, Mux). Each point is a strain state whose β is solved so its moment points along θ, so β differs from point to point. The displayed β (N.A.), the section field and the σ–ε points belong to the strength point of the selected check.'}</p>
    </div>
  </MovableDialog>
}
