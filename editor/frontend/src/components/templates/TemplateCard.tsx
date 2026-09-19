import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    builtIn: boolean;
  };
  onApply: (id: string) => void;
}

export function TemplateCard({ template, onApply }: TemplateCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {template.name}
          {template.builtIn && <Badge variant="muted" className="text-[10px]">built-in</Badge>}
        </CardTitle>
        <CardDescription className="text-xs line-clamp-2">{template.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 flex-wrap">
          {template.tags.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button size="sm" onClick={() => onApply(template.id)} className="w-full">
          Apply Template
        </Button>
      </CardFooter>
    </Card>
  );
}
