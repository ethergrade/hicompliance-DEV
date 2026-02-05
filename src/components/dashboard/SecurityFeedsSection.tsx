 import React from 'react';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { ScrollArea } from '@/components/ui/scroll-area';
 import { Skeleton } from '@/components/ui/skeleton';
 import { ExternalLink, Shield, AlertTriangle, RefreshCw } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { SecurityFeedCard } from './SecurityFeedCard';
 import { useACNFeeds } from '@/hooks/useACNFeeds';
 
 export const SecurityFeedsSection: React.FC = () => {
   const { nis2Feed, threatFeed, isLoading, error, refetch } = useACNFeeds();
 
   const FeedSkeleton = () => (
     <div className="space-y-3">
       {[1, 2, 3].map((i) => (
         <div key={i} className="p-3 rounded-lg border border-border">
           <Skeleton className="h-4 w-3/4 mb-2" />
           <Skeleton className="h-3 w-full mb-1" />
           <Skeleton className="h-3 w-2/3" />
         </div>
       ))}
     </div>
   );
 
   return (
     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
       {/* NIS2 Feed */}
       <Card className="border-border">
         <CardHeader className="pb-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
               <div className="p-1.5 rounded-md bg-blue-500/10">
                 <Shield className="w-4 h-4 text-blue-500" />
               </div>
               <CardTitle className="text-lg">Novità NIS2</CardTitle>
             </div>
             <div className="flex items-center gap-2">
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8"
                 onClick={refetch}
                 disabled={isLoading}
               >
                 <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
               </Button>
               <a
                 href="https://www.acn.gov.it/portale/nis/notizie-ed-eventi"
                 target="_blank"
                 rel="noopener noreferrer"
                 className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
               >
                 Vedi tutti
                 <ExternalLink className="w-3 h-3" />
               </a>
             </div>
           </div>
         </CardHeader>
         <CardContent>
           <ScrollArea className="h-[280px] pr-3">
             {isLoading ? (
               <FeedSkeleton />
             ) : error && nis2Feed.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                 <p className="text-sm">Nessun aggiornamento disponibile</p>
                 <Button variant="ghost" size="sm" onClick={refetch} className="mt-2">
                   Riprova
                 </Button>
               </div>
             ) : (
               <div className="space-y-3">
                 {nis2Feed.slice(0, 6).map((item, index) => (
                   <SecurityFeedCard key={index} item={item} />
                 ))}
               </div>
             )}
           </ScrollArea>
         </CardContent>
       </Card>
 
       {/* Threat Feed */}
       <Card className="border-border">
         <CardHeader className="pb-3">
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
               <div className="p-1.5 rounded-md bg-red-500/10">
                 <AlertTriangle className="w-4 h-4 text-red-500" />
               </div>
               <CardTitle className="text-lg">Alert Sicurezza</CardTitle>
             </div>
             <div className="flex items-center gap-2">
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8"
                 onClick={refetch}
                 disabled={isLoading}
               >
                 <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
               </Button>
               <a
                 href="https://www.csirt.gov.it"
                 target="_blank"
                 rel="noopener noreferrer"
                 className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
               >
                 Vedi tutti
                 <ExternalLink className="w-3 h-3" />
               </a>
             </div>
           </div>
         </CardHeader>
         <CardContent>
           <ScrollArea className="h-[280px] pr-3">
             {isLoading ? (
               <FeedSkeleton />
             ) : error && threatFeed.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                 <p className="text-sm">Nessun aggiornamento disponibile</p>
                 <Button variant="ghost" size="sm" onClick={refetch} className="mt-2">
                   Riprova
                 </Button>
               </div>
             ) : (
               <div className="space-y-3">
                 {threatFeed.slice(0, 6).map((item, index) => (
                   <SecurityFeedCard key={index} item={item} />
                 ))}
               </div>
             )}
           </ScrollArea>
         </CardContent>
       </Card>
     </div>
   );
 };