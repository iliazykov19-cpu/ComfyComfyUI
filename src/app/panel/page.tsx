'use client';

import Link from 'next/link';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PanelForm } from '@/components/PanelForm';
import { PromptBuilderWindow } from '@/components/PromptBuilder';
import { useWorkflowStore } from '@/store/workflow';
import { useT } from '@/store/i18n';

export default function PanelPage() {
  const t = useT();
  const workflow = useWorkflowStore((s) => s.workflow);
  const exposed = useWorkflowStore((s) => s.exposed);
  const workflowName = useWorkflowStore((s) => s.workflowName);

  return (
    <>
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight">{t('panel.title')}</h1>
          <p className="text-muted-foreground mt-1">
            {workflow
              ? `${t('panel.subtitleWithWf')} ${workflowName || t('panel.unnamed')}`
              : t('panel.subtitleNoWf')}
          </p>
        </section>

        {!workflow ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('panel.noWorkflowTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <Link href="/workflow" className="underline hover:text-foreground">
                {t('panel.openWorkflow')}
              </Link>
              .
            </CardContent>
          </Card>
        ) : exposed.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('panel.noExposedTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <Link href="/workflow" className="underline hover:text-foreground">
                {t('panel.openWorkflow')}
              </Link>{' '}
              — {t('panel.noExposedBody')}
            </CardContent>
          </Card>
        ) : (
          <PanelForm />
        )}
      </main>
      <PromptBuilderWindow />
    </>
  );
}
