
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, FileText, Database, MessageSquare, Settings } from "lucide-react";
import DocumentationService from "@/services/DocumentationService";
import { debug, info, warn, error } from '@/utils/logging';
import { usePreferences } from "@/contexts/PreferencesContext";

const DocumentationViewer = () => {
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "DocumentationViewer: Component rendered.");

  const [appOverview, setAppOverview] = useState<string>("");
  const [featuresInventory, setFeaturesInventory] = useState<string>("");
  const [databaseSchema, setDatabaseSchema] = useState<string>("");
  const [aiPatterns, setAiPatterns] = useState<string>("");
  const [aiContext, setAiContext] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    info(loggingLevel, "DocumentationViewer: useEffect triggered, loading documentation.");
    loadDocumentation();
  }, [loggingLevel]); // Add loggingLevel to dependency array

  const loadDocumentation = async () => {
    info(loggingLevel, "DocumentationViewer: Starting loadDocumentation.");
    setIsLoading(true);
    try {
      // Load static documentation files
      debug(loggingLevel, "DocumentationViewer: Fetching static documentation files.");
      const [overviewRes, featuresRes, schemaRes, patternsRes] = await Promise.all([
        fetch('/docs/app-overview.md'),
        fetch('/docs/features-inventory.md'),
        fetch('/docs/database-schema.md'),
        fetch('/docs/ai-command-patterns.md')
      ]);

      if (overviewRes.ok) {
        setAppOverview(await overviewRes.text());
        debug(loggingLevel, "DocumentationViewer: App overview loaded.");
      } else {
        warn(loggingLevel, "DocumentationViewer: Failed to load app overview.");
      }
      if (featuresRes.ok) {
        setFeaturesInventory(await featuresRes.text());
        debug(loggingLevel, "DocumentationViewer: Features inventory loaded.");
      } else {
        warn(loggingLevel, "DocumentationViewer: Failed to load features inventory.");
      }
      if (schemaRes.ok) {
        setDatabaseSchema(await schemaRes.text());
        debug(loggingLevel, "DocumentationViewer: Database schema loaded.");
      } else {
        warn(loggingLevel, "DocumentationViewer: Failed to load database schema.");
      }
      if (patternsRes.ok) {
        setAiPatterns(await patternsRes.text());
        debug(loggingLevel, "DocumentationViewer: AI patterns loaded.");
      } else {
        warn(loggingLevel, "DocumentationViewer: Failed to load AI patterns.");
      }

      if (overviewRes.ok) setAppOverview(await overviewRes.text());
      if (featuresRes.ok) setFeaturesInventory(await featuresRes.text());
      if (schemaRes.ok) setDatabaseSchema(await schemaRes.text());
      if (patternsRes.ok) setAiPatterns(await patternsRes.text());

      // Load dynamic AI context
      debug(loggingLevel, "DocumentationViewer: Getting AI context from DocumentationService.");
      const docService = DocumentationService.getInstance();
      const context = await docService.getAIContext(undefined, loggingLevel);
      setAiContext(context);
      info(loggingLevel, "DocumentationViewer: AI context loaded.");
      
      setLastUpdated(new Date());
    } catch (err) {
      error(loggingLevel, 'DocumentationViewer: Error loading documentation:', err);
    } finally {
      setIsLoading(false);
      debug(loggingLevel, "DocumentationViewer: loadDocumentation finished, isLoading set to false.");
    }
  };

  const refreshContext = async () => {
    info(loggingLevel, "DocumentationViewer: Starting refreshContext.");
    setIsLoading(true);
    try {
      const docService = DocumentationService.getInstance();
      docService.invalidateCache(loggingLevel); // Pass loggingLevel
      debug(loggingLevel, "DocumentationViewer: Cache invalidated, getting new AI context.");
      const context = await docService.getAIContext(undefined, loggingLevel);
      setAiContext(context);
      info(loggingLevel, "DocumentationViewer: AI context refreshed.");
      setLastUpdated(new Date());
    } catch (err) {
      error(loggingLevel, 'DocumentationViewer: Error refreshing context:', err);
    } finally {
      setIsLoading(false);
      debug(loggingLevel, "DocumentationViewer: refreshContext finished, isLoading set to false.");
    }
  };

  const renderMarkdown = (content: string) => {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed">{content}</pre>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">App Documentation</h2>
          <p className="text-muted-foreground">
            Comprehensive documentation for AI context and development reference
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <Badge variant="outline">
              Updated: {lastUpdated.toLocaleTimeString()}
            </Badge>
          )}
          <Button
            onClick={refreshContext}
            variant="outline"
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Context
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-10 grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2" onClick={() => debug(loggingLevel, "DocumentationViewer: Switched to Overview tab.")}>
            <FileText className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="features" className="flex items-center gap-2" onClick={() => debug(loggingLevel, "DocumentationViewer: Switched to Features tab.")}>
            <Settings className="h-4 w-4" />
            Features
          </TabsTrigger>
          <TabsTrigger value="database" className="flex items-center gap-2" onClick={() => debug(loggingLevel, "DocumentationViewer: Switched to Database tab.")}>
            <Database className="h-4 w-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="ai-patterns" className="flex items-center gap-2" onClick={() => debug(loggingLevel, "DocumentationViewer: Switched to AI Patterns tab.")}>
            <MessageSquare className="h-4 w-4" />
            AI Patterns
          </TabsTrigger>
          <TabsTrigger value="ai-context" className="flex items-center gap-2" onClick={() => debug(loggingLevel, "DocumentationViewer: Switched to Live Context tab.")}>
            <RefreshCw className="h-4 w-4" />
            Live Context
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>App Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {appOverview ? renderMarkdown(appOverview) : (
                <p className="text-muted-foreground">Loading app overview...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Features Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {featuresInventory ? renderMarkdown(featuresInventory) : (
                <p className="text-muted-foreground">Loading features inventory...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle>Database Schema</CardTitle>
            </CardHeader>
            <CardContent>
              {databaseSchema ? renderMarkdown(databaseSchema) : (
                <p className="text-muted-foreground">Loading database schema...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-patterns">
          <Card>
            <CardHeader>
              <CardTitle>AI Command Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              {aiPatterns ? renderMarkdown(aiPatterns) : (
                <p className="text-muted-foreground">Loading AI patterns...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Features Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              {featuresInventory ? renderMarkdown(featuresInventory) : (
                <p className="text-muted-foreground">Loading features inventory...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle>Database Schema</CardTitle>
            </CardHeader>
            <CardContent>
              {databaseSchema ? renderMarkdown(databaseSchema) : (
                <p className="text-muted-foreground">Loading database schema...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-patterns">
          <Card>
            <CardHeader>
              <CardTitle>AI Command Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              {aiPatterns ? renderMarkdown(aiPatterns) : (
                <p className="text-muted-foreground">Loading AI patterns...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-context">
          <Card>
            <CardHeader>
              <CardTitle>Live AI Context</CardTitle>
              <p className="text-sm text-muted-foreground">
                This is the current context that would be provided to the AI assistant
              </p>
            </CardHeader>
            <CardContent>
              {aiContext ? renderMarkdown(aiContext) : (
                <p className="text-muted-foreground">Loading AI context...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DocumentationViewer;
