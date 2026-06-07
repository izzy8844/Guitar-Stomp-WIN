'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Globe } from 'lucide-react'
import { content, Locale } from './i18n'

export default function GuidePage() {
  const [locale, setLocale] = useState<Locale>('zh')
  const t = content[locale]

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-sm border-b border-zinc-800">
        <div className="max-w-3xl mx-auto pl-20 pr-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{t.back}</span>
            </Link>
            <h1 className="text-sm font-semibold text-white">{t.title}</h1>
          </div>
          {/* Language Switcher */}
          <button
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 hover:text-white transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{locale === 'zh' ? 'EN' : '中文'}</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Guitar AutoStomp</h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-xl mx-auto">{t.subtitle}</p>
          <div className="flex items-center justify-center gap-3 text-xs">
            <span className="px-3 py-1 rounded-full bg-green-900/30 text-green-400 border border-green-800">{t.tags[0]}</span>
            <span className="px-3 py-1 rounded-full bg-blue-900/30 text-blue-400 border border-blue-800">{t.tags[1]}</span>
            <span className="px-3 py-1 rounded-full bg-purple-900/30 text-purple-400 border border-purple-800">{t.tags[2]}</span>
          </div>
        </section>

        {/* Quick Start Steps */}
        <section className="space-y-2">
          <h3 className="text-xl font-bold mb-6">{t.quickStartTitle}</h3>
          {t.steps.map((step, idx) => (
            <div key={idx} className="space-y-4 mb-8">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-green-900/40 text-green-400 flex items-center justify-center text-sm font-bold shrink-0">
                  {idx + 1}
                </span>
                <h4 className="text-lg font-semibold">{step.title}</h4>
              </div>
              <div className="ml-11 space-y-4">
                {step.content.map((p, i) => (
                  <p key={i} className="text-sm text-zinc-400 leading-relaxed">{p}</p>
                ))}
                {step.substeps?.map((sub, si) => (
                  <div key={si} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                    <h5 className="text-sm font-medium text-white mb-3">{sub.title}</h5>
                    <ol className="text-sm text-zinc-400 space-y-2 list-decimal list-inside">
                      {sub.items.map((item, ii) => (
                        <li key={ii}>{item}</li>
                      ))}
                    </ol>
                  </div>
                ))}
                {step.tip && (
                  <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-700/50">
                    <p className="text-sm text-zinc-400">
                      <strong className="text-green-400">💡 Tip：</strong>{step.tip}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Detail Sections */}
        {t.sections.map((section) => (
          <section key={section.id} className="space-y-4">
            <h3 className="text-lg font-semibold">{section.title}</h3>
            {section.content.map((p, i) => (
              <p key={i} className="text-sm text-zinc-400 leading-relaxed">{p}</p>
            ))}
            {section.subsections?.map((sub, si) => (
              <div key={si} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <h4 className="text-sm font-medium text-white mb-3">{sub.title}</h4>
                <ul className="text-sm text-zinc-400 space-y-2 list-disc list-inside">
                  {sub.items.map((item, ii) => (
                    <li key={ii}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            {section.tip && (
              <div className="bg-zinc-900/60 rounded-xl p-4 border border-zinc-700/50">
                <p className="text-sm text-zinc-400">
                  <strong className="text-green-400">💡 Tip：</strong>{section.tip}
                </p>
              </div>
            )}
          </section>
        ))}

        {/* Keyboard Shortcuts */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">
            {locale === 'zh' ? '键盘快捷键' : 'Keyboard Shortcuts'}
          </h3>
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {t.shortcuts.map((sc, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-zinc-800' : ''}>
                    <td className="px-4 py-2.5 w-40">
                      <code className="text-green-400 bg-zinc-800 px-2 py-0.5 rounded text-xs">{sc.key}</code>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{sc.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">{locale === 'zh' ? '常见问题' : 'FAQ'}</h3>
          <div className="space-y-3">
            {t.faq.map((item, i) => (
              <div key={i} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                <h4 className="text-sm font-medium text-white mb-1">Q: {item.q}</h4>
                <p className="text-sm text-zinc-400">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center pt-4 pb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
          >
            {t.cta}
          </Link>
        </div>
      </main>
    </div>
  )
}
