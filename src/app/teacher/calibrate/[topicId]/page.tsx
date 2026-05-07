'use client'

import { useParams } from 'next/navigation'

export default function CalibrateTopic() {
  const { topicId } = useParams()

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Калибровка темы</h1>
      <p className="text-[#A1A1AA]">Topic ID: {topicId}</p>
      <p className="text-[#A1A1AA] mt-1">Редактор калибровки — следующий шаг</p>
    </div>
  )
}
