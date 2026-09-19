import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight } from 'lucide-react';

interface PlaybookCardProps {
  playbook: {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    stageCount?: number;
    stages?: { id: string }[];
  };
  onPreview: (id: string) => void;
}

export function PlaybookCard({ playbook, onPreview }: PlaybookCardProps) {
  const count = playbook.stageCount ?? playbook.stages?.length ?? 0;
  const categoryLabel: Record<string, string> = {
    scaffold: '搭建',
    audit: '审计',
    deploy: '部署',
    research: '研究',
    custom: '自定义',
  };

  return (
    <Card
      className="group cursor-pointer transition-all hover:shadow-md"
      onClick={() => onPreview(playbook.id)}
    >
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="truncate">{playbook.name}</CardTitle>
            <Badge variant="accent" className="shrink-0">
              {categoryLabel[playbook.category] ?? playbook.category}
           </Badge>
         </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
       </div>

        <p className="text-[12.5px] text-muted-foreground leading-relaxed line-clamp-2 mb-3">
          {playbook.description}
       </p>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10.5px] text-muted-foreground tracking-[0.08em]">
            {count} 个阶段
         </span>
          {playbook.tags && playbook.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {playbook.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
               </Badge>
              ))}
           </div>
          )}
       </div>
     </CardContent>
   </Card>
  );
}