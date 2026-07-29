import { useEffect, useState } from 'react';
import { useSkillsStore } from '@/stores/skills-store';
import { SchemaViewer } from '@/components/SchemaViewer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/i18n';

export function SkillsView() {
  const { skills, loading, error, fetchSkills, scanSkills } = useSkillsStore();
  const [tab, setTab] = useState<'skills' | 'schema'>('skills');
  const [extraPath, setExtraPath] = useState('');

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('Skills & Schema')}</h1>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'skills' | 'schema')}>
        <TabsList>
          <TabsTrigger value="skills">{t('Skills')} ({skills.length})</TabsTrigger>
          <TabsTrigger value="schema">{t('Schema')}</TabsTrigger>
        </TabsList>

        <TabsContent value="skills" className="space-y-4">
          <div className="flex gap-3 items-center">
            <Input
              className="max-w-sm"
              placeholder={t('Extra scan path (optional)')}
              value={extraPath}
              onChange={(e) => setExtraPath(e.target.value)}
            />
            <Button onClick={() => scanSkills(extraPath ? [extraPath] : undefined)} disabled={loading}>
              {loading ? t('Scanning...') : t('Rescan')}
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
                  <CardContent><Skeleton className="h-4 w-full" /></CardContent>
                </Card>
              ))}
            </div>
          ) : skills.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-2">{t('No skills found')}</p>
              <p className="text-sm">{t('Trigger a scan to discover available skills.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skills.map((skill, i) => (
                <Card key={i}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{skill.name}</CardTitle>
                      <Badge variant={skill.source === 'skill' ? 'default' : 'secondary'}>
                        {skill.source}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-xs mb-2">{skill.description}</CardDescription>
                    {skill.path && <p className="text-[10px] text-muted-foreground truncate">{skill.path}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="schema">
          <SchemaViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}
