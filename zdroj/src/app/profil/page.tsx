'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PropertyGrid } from '@/components/property-grid';
import { useAuth } from '@/hooks/use-auth';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestDeleteCover,
  nestDeleteMyProperty,
  nestDeleteShortsListing,
  nestFetchFavorites,
  nestFetchMe,
  nestCreateShortsFromClassic,
  nestFetchMyShortsDrafts,
  nestFetchMyListings,
  nestFetchProfileWall,
  nestListNotifications,
  nestMarkNotificationRead,
  nestPatchBrokerLeadPrefs,
  nestPatchBrokerPublicProfile,
  nestPatchAvatarCrop,
  nestPatchCoverCrop,
  nestPatchProfessionalVisibility,
  nestListMyCompanyAds,
  nestPatchMyProperty,
  nestPatchProfileBio,
  nestSubmitAgentProfileRequest,
  nestSubmitAgencyProfileRequest,
  nestSubmitCompanyProfileRequest,
  nestSubmitFinancialAdvisorProfileRequest,
  nestSubmitInvestorProfileRequest,
  nestUploadAgentProfileLogo,
  nestUploadAvatar,
  nestUploadCover,
  NEST_PROFILE_IMAGE_MAX_BYTES,
  type NestMeProfile,
  type NestMyListingRow,
  type NestProfileWallPost,
  type NestProfileWallVideo,
  type NestCompanyAdRow,
  type NestShortsListingDraft,
  type UserNotificationRow,
} from '@/lib/nest-client';
import {
  ImageCropEditorModal,
  imageCropToStyle,
  type ImageCrop,
} from '@/components/profile/image-crop-editor-modal';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';
import {
  canCreateProfessionalListingsAndPosts,
  canRequestProfessionalProfileUpgrade,
  dashboardPathForRole,
} from '@/lib/roles';
import { ProfessionalOnlyDialog } from '@/components/auth/ProfessionalListingRestriction';

const BIO_MAX = 500;
const ACCEPT_IMAGES = 'image/jpeg,image/jpg,image/png,image/webp';

const LISTING_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktivní',
  INACTIVE: 'Neaktivní',
  EXPIRED: 'Expirovaný',
  SCHEDULED: 'Naplánováno',
  PENDING_APPROVAL: 'Čeká na schválení',
  DELETED: 'Smazáno',
};

function assertImageFile(file: File): string | null {
  const okMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const lower = file.name.toLowerCase();
  const okExt = /\.(jpe?g|png|webp)$/.test(lower);
  if (!okMime && !okExt) {
    return 'Nepodporovaný formát. Použijte JPG, PNG nebo WebP.';
  }
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

export default function ProfilPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, apiAccessToken, refresh, setUser } = useAuth();
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);
  const [nestAvatar, setNestAvatar] = useState<string | null>(null);
  const [nestCover, setNestCover] = useState<string | null>(null);
  const [nestBio, setNestBio] = useState<string | null>(null);
  const [nestMe, setNestMe] = useState<NestMeProfile | null>(null);
  const [notifications, setNotifications] = useState<UserNotificationRow[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [favorites, setFavorites] = useState<PropertyFeedItem[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [myListings, setMyListings] = useState<NestMyListingRow[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [wallLoading, setWallLoading] = useState(false);
  const [wallPosts, setWallPosts] = useState<NestProfileWallPost[]>([]);
  const [wallVideos, setWallVideos] = useState<NestProfileWallVideo[]>([]);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [professionalVisibility, setProfessionalVisibility] = useState<boolean>(false);
  const [companyAds, setCompanyAds] = useState<NestCompanyAdRow[]>([]);

  const [brokerOffice, setBrokerOffice] = useState('');
  const [brokerSpec, setBrokerSpec] = useState('');
  const [brokerRegion, setBrokerRegion] = useState('');
  const [brokerWeb, setBrokerWeb] = useState('');
  const [brokerPhone, setBrokerPhone] = useState('');
  const [brokerEmailPub, setBrokerEmailPub] = useState('');
  const [brokerFieldsSaving, setBrokerFieldsSaving] = useState(false);
  const [brokerFieldsError, setBrokerFieldsError] = useState<string | null>(null);
  const [shortsCreatingId, setShortsCreatingId] = useState<string | null>(null);
  const [shortsDrafts, setShortsDrafts] = useState<NestShortsListingDraft[]>([]);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<ImageCrop | null>(null);
  const [coverCrop, setCoverCrop] = useState<ImageCrop | null>(null);
  const [avatarCropOpen, setAvatarCropOpen] = useState(false);
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  const [avatarCropImageUrl, setAvatarCropImageUrl] = useState<string | null>(null);
  const [coverCropImageUrl, setCoverCropImageUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [bioDraft, setBioDraft] = useState('');
  const [bioEditing, setBioEditing] = useState(false);

  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [agentFullName, setAgentFullName] = useState('');
  const [agentCompany, setAgentCompany] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [agentWeb, setAgentWeb] = useState('');
  const [agentIco, setAgentIco] = useState('');
  const [agentCity, setAgentCity] = useState('');
  const [agentBio, setAgentBio] = useState('');
  const [agentLogoUrl, setAgentLogoUrl] = useState<string | null>(null);
  const [agentLogoUploading, setAgentLogoUploading] = useState(false);
  const [agentSubmitting, setAgentSubmitting] = useState(false);
  const [agentFormError, setAgentFormError] = useState<string | null>(null);
  const agentLogoInputRef = useRef<HTMLInputElement>(null);
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyFormError, setCompanyFormError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyContact, setCompanyContact] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWeb, setCompanyWeb] = useState('');
  const [companyIco, setCompanyIco] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyDesc, setCompanyDesc] = useState('');
  const [companyServices, setCompanyServices] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [agencyFormOpen, setAgencyFormOpen] = useState(false);
  const [agencySubmitting, setAgencySubmitting] = useState(false);
  const [agencyFormError, setAgencyFormError] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState('');
  const [agencyContact, setAgencyContact] = useState('');
  const [agencyPhone, setAgencyPhone] = useState('');
  const [agencyEmail, setAgencyEmail] = useState('');
  const [agencyWeb, setAgencyWeb] = useState('');
  const [agencyIco, setAgencyIco] = useState('');
  const [agencyCity, setAgencyCity] = useState('');
  const [agencyDesc, setAgencyDesc] = useState('');
  const [agencyAgentCount, setAgencyAgentCount] = useState('');
  const [agencyBranches, setAgencyBranches] = useState('');
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [advisorFormOpen, setAdvisorFormOpen] = useState(false);
  const [advisorSubmitting, setAdvisorSubmitting] = useState(false);
  const [advisorFormError, setAdvisorFormError] = useState<string | null>(null);
  const [advisorFullName, setAdvisorFullName] = useState('');
  const [advisorBrandName, setAdvisorBrandName] = useState('');
  const [advisorPhone, setAdvisorPhone] = useState('');
  const [advisorEmail, setAdvisorEmail] = useState('');
  const [advisorWeb, setAdvisorWeb] = useState('');
  const [advisorIco, setAdvisorIco] = useState('');
  const [advisorCity, setAdvisorCity] = useState('');
  const [advisorBio, setAdvisorBio] = useState('');
  const [advisorSpecializations, setAdvisorSpecializations] = useState('');
  const [advisorAvatarUrl, setAdvisorAvatarUrl] = useState('');
  const [advisorLogoUrl, setAdvisorLogoUrl] = useState('');
  const [investorFormOpen, setInvestorFormOpen] = useState(false);
  const [investorSubmitting, setInvestorSubmitting] = useState(false);
  const [investorFormError, setInvestorFormError] = useState<string | null>(null);
  const [investorFullName, setInvestorFullName] = useState('');
  const [investorName, setInvestorName] = useState('');
  const [investorType, setInvestorType] = useState('');
  const [investorPhone, setInvestorPhone] = useState('');
  const [investorEmail, setInvestorEmail] = useState('');
  const [investorWeb, setInvestorWeb] = useState('');
  const [investorCity, setInvestorCity] = useState('');
  const [investorBio, setInvestorBio] = useState('');
  const [investorFocus, setInvestorFocus] = useState('');
  const [investorAvatarUrl, setInvestorAvatarUrl] = useState('');
  const [investorLogoUrl, setInvestorLogoUrl] = useState('');
  /** Staré lokální `/uploads/…` na Railway po deployi vrací 404 — zobrazí se placeholder. */
  const [avatarRemoteFailed, setAvatarRemoteFailed] = useState(false);
  const [coverRemoteFailed, setCoverRemoteFailed] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const previousCoverCropRef = useRef<ImageCrop | null>(null);
  const uctNavHandledRef = useRef(false);
  const [professionalListingDialogOpen, setProfessionalListingDialogOpen] = useState(false);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 4000);
  }, []);

  const loadNestProfile = useCallback(async () => {
    const me = await nestFetchMe(apiAccessToken);
    /** Při chybě GET /users/me nesmazat už načtené URL — držíme stav z auth / posledního uploadu. */
    if (!me) return;
    setNestMe(me);
    setNestAvatar(me.avatarUrl ?? null);
    setNestCover(me.coverImageUrl ?? null);
    setAvatarCrop(me.avatarCrop ?? null);
    setCoverCrop(me.coverCrop ?? null);
    setNestBio(me.bio ?? null);
    setBioDraft(me.bio ?? '');
    const visibility =
      me.role === 'AGENT'
        ? Boolean(me.isPublicBrokerProfile)
        : me.role === 'COMPANY'
          ? Boolean(me.companyProfile?.isPublic)
          : me.role === 'AGENCY'
            ? Boolean(me.agencyProfile?.isPublic)
            : me.role === 'FINANCIAL_ADVISOR'
              ? Boolean(me.financialAdvisorProfile?.isPublic)
              : me.role === 'INVESTOR'
                ? Boolean(me.investorProfile?.isPublic)
            : false;
    setProfessionalVisibility(visibility);
  }, [apiAccessToken]);

  const loadNotifications = useCallback(async () => {
    if (!apiAccessToken || user?.role !== 'AGENT') return;
    setNotifLoading(true);
    const rows = await nestListNotifications(apiAccessToken);
    setNotifLoading(false);
    setNotifications(rows ?? []);
  }, [apiAccessToken, user?.role]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const loadFavorites = useCallback(async () => {
    if (!apiAccessToken) {
      setFavorites([]);
      return;
    }
    setFavLoading(true);
    setFavError(null);
    const raw = await nestFetchFavorites(apiAccessToken);
    setFavLoading(false);
    if (!raw) {
      setFavError('Oblíbené se nepodařilo načíst (zkontroluj Nest API a JWT).');
      setFavorites([]);
      return;
    }
    const items: PropertyFeedItem[] = [];
    for (const row of raw) {
      const n = safeNormalizePropertyFromApi(row);
      if (n) items.push({ ...n, liked: true });
    }
    setFavorites(items);
  }, [apiAccessToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadNestProfile();
  }, [loadNestProfile, isAuthenticated]);

  useEffect(() => {
    if (!nestMe || user?.role !== 'AGENT') return;
    setBrokerOffice(nestMe.brokerOfficeName ?? '');
    setBrokerSpec(nestMe.brokerSpecialization ?? '');
    setBrokerRegion(nestMe.brokerRegionLabel ?? '');
    setBrokerWeb(nestMe.brokerWeb ?? '');
    setBrokerPhone(nestMe.brokerPhonePublic ?? '');
    setBrokerEmailPub(nestMe.brokerEmailPublic ?? '');
  }, [nestMe, user?.role]);

  const loadMyListings = useCallback(async () => {
    if (!apiAccessToken) {
      setMyListings([]);
      return;
    }
    setListingsLoading(true);
    setListingsError(null);
    const rows = await nestFetchMyListings(apiAccessToken);
    setListingsLoading(false);
    if (!rows) {
      setListingsError('Inzeráty se nepodařilo načíst.');
      setMyListings([]);
      return;
    }
    setMyListings(rows);
  }, [apiAccessToken]);

  useEffect(() => {
    void loadMyListings();
  }, [loadMyListings]);

  useEffect(() => {
    if (
      !user?.id ||
      !['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user.role)
    ) {
      setWallPosts([]);
      setWallVideos([]);
      return;
    }
    setWallLoading(true);
    void nestFetchProfileWall(user.id, apiAccessToken).then((rows) => {
      setWallLoading(false);
      setWallPosts(rows?.posts ?? []);
      setWallVideos(rows?.videos ?? []);
    });
  }, [user?.id, user?.role, apiAccessToken]);

  const loadShortsDrafts = useCallback(async () => {
    if (!apiAccessToken) {
      setShortsDrafts([]);
      return;
    }
    const d = await nestFetchMyShortsDrafts(apiAccessToken);
    setShortsDrafts(d ?? []);
  }, [apiAccessToken]);

  useEffect(() => {
    void loadShortsDrafts();
  }, [loadShortsDrafts]);

  /** Po návratu na stránku: pokud Nest /users/me nestihl, použij avatar z auth session. */
  useEffect(() => {
    if (user?.avatar) {
      setNestAvatar((prev) => prev ?? user.avatar ?? null);
    }
  }, [user?.avatar]);

  useEffect(() => {
    const c = user?.coverImage;
    if (typeof c === 'string' && c.trim()) {
      setNestCover((prev) => prev ?? c);
    }
  }, [user?.coverImage]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    if (!apiAccessToken || user?.role !== 'COMPANY') {
      setCompanyAds([]);
      return;
    }
    void nestListMyCompanyAds(apiAccessToken).then((rows) => {
      setCompanyAds(rows ?? []);
    });
  }, [apiAccessToken, user?.role]);

  const avatarUrl = nestAvatar ?? user?.avatar ?? null;
  const coverUrl = nestCover ?? (user as { coverImage?: string | null })?.coverImage ?? null;
  const bioText = nestBio ?? (user as { bio?: string | null })?.bio ?? null;
  const activeCompanyAds = companyAds.filter((ad) => ad.isActive).length;
  const inactiveCompanyAds = Math.max(0, companyAds.length - activeCompanyAds);

  const imgSrc = useMemo(() => {
    if (!avatarUrl) return null;
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    if (avatarUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(avatarUrl) || avatarUrl;
    }
    return avatarUrl;
  }, [avatarUrl]);

  const coverSrc = useMemo(() => {
    if (!coverUrl) return null;
    if (/^https?:\/\//i.test(coverUrl)) return coverUrl;
    if (coverUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(coverUrl) || coverUrl;
    }
    return coverUrl;
  }, [coverUrl]);

  useEffect(() => {
    setAvatarRemoteFailed(false);
  }, [imgSrc]);

  useEffect(() => {
    setCoverRemoteFailed(false);
  }, [coverSrc]);

  const displayAvatarSrc = avatarPreview ?? (avatarRemoteFailed ? null : imgSrc);
  const displayCoverSrc = coverPreview ?? (coverRemoteFailed ? null : coverSrc);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiAccessToken) return;
    const err = assertImageFile(file);
    if (err) {
      setAvatarError(err);
      return;
    }
    setAvatarError(null);
    const local = URL.createObjectURL(file);
    setAvatarPreview(local);
    setPendingAvatarFile(file);
    setAvatarCropImageUrl(local);
    setAvatarCropOpen(true);
  }

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiAccessToken) return;
    const err = assertImageFile(file);
    if (err) {
      setCoverError(err);
      return;
    }
    setCoverError(null);
    const local = URL.createObjectURL(file);
    previousCoverCropRef.current = coverCrop;
    setCoverCrop(null);
    setCoverPreview(local);
    setPendingCoverFile(file);
    setCoverCropImageUrl(local);
    setCoverCropOpen(true);
  }

  async function onDeleteCover() {
    if (!apiAccessToken) return;
    setCoverError(null);
    setCoverUploading(true);
    const res = await nestDeleteCover(apiAccessToken);
    setCoverUploading(false);
    if (!res.ok) {
      setCoverError(res.error ?? 'Smazání cover se nezdařilo.');
      return;
    }
    setNestCover(null);
    await refresh();
    setUser((prev) => (prev ? { ...prev, coverImage: null } : prev));
    showSuccess('Cover byl odstraněn.');
  }

  function isTouchLikeDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }

  function openAvatarEditorFromImage() {
    if (!displayAvatarSrc) {
      avatarInputRef.current?.click();
      return;
    }
    setPendingAvatarFile(null);
    setAvatarCropImageUrl(displayAvatarSrc);
    setAvatarCropOpen(true);
  }

  function openCoverEditorFromImage() {
    if (!displayCoverSrc) {
      coverInputRef.current?.click();
      return;
    }
    setPendingCoverFile(null);
    setCoverCropImageUrl(displayCoverSrc);
    setCoverCropOpen(true);
  }

  async function onSaveAvatarCrop(crop: ImageCrop) {
    if (!apiAccessToken) return;
    if (pendingAvatarFile) {
      setAvatarUploading(true);
      const upload = await nestUploadAvatar(apiAccessToken, pendingAvatarFile, crop);
      setAvatarUploading(false);
      if (upload.error) {
        setAvatarError(upload.error);
        return;
      }
      if (upload.avatarUrl) {
        setNestAvatar(upload.avatarUrl);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                avatar: upload.avatarUrl ?? prev.avatar ?? null,
              }
            : prev,
        );
      }
      await refresh();
      setPendingAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setAvatarCrop(crop);
      setAvatarCropOpen(false);
      setAvatarCropImageUrl(null);
      showSuccess('Profilová fotka byla uložena.');
      return;
    }
    if (!nestAvatar) return;
    const res = await nestPatchAvatarCrop(apiAccessToken, nestAvatar, crop);
    if (!res.ok) {
      setAvatarError(res.error ?? 'Uložení výřezu profilové fotky selhalo.');
      return;
    }
    setAvatarCrop(crop);
    setAvatarCropOpen(false);
    setAvatarCropImageUrl(null);
    await loadNestProfile();
    await refresh();
    showSuccess('Výřez profilové fotky byl uložen.');
  }

  async function onSaveCoverCrop(crop: ImageCrop) {
    if (!apiAccessToken) return;
    if (pendingCoverFile) {
      setCoverUploading(true);
      const upload = await nestUploadCover(apiAccessToken, pendingCoverFile, crop);
      setCoverUploading(false);
      if (upload.error) {
        setCoverError(upload.error);
        return;
      }
      if (upload.coverImageUrl) {
        setNestCover(upload.coverImageUrl);
        setUser((prev) =>
          prev
            ? {
                ...prev,
                coverImage: upload.coverImageUrl ?? prev.coverImage ?? null,
              }
            : prev,
        );
      }
      await refresh();
      setPendingCoverFile(null);
      previousCoverCropRef.current = null;
      if (coverPreview) URL.revokeObjectURL(coverPreview);
      setCoverPreview(null);
      setCoverCrop(crop);
      setCoverCropOpen(false);
      setCoverCropImageUrl(null);
      showSuccess('Cover obrázek byl uložen.');
      return;
    }
    if (!nestCover) return;
    const res = await nestPatchCoverCrop(apiAccessToken, nestCover, crop);
    if (!res.ok) {
      setCoverError(res.error ?? 'Uložení výřezu cover fotky selhalo.');
      return;
    }
    setCoverCrop(crop);
    setCoverCropOpen(false);
    setCoverCropImageUrl(null);
    await loadNestProfile();
    await refresh();
    showSuccess('Výřez cover fotky byl uložen.');
  }

  async function onSaveBio() {
    if (!apiAccessToken) return;
    if (bioDraft.length > BIO_MAX) {
      setBioError(`Bio může mít maximálně ${BIO_MAX} znaků.`);
      return;
    }
    setBioError(null);
    setBioSaving(true);
    const res = await nestPatchProfileBio(apiAccessToken, bioDraft.trim() || null);
    setBioSaving(false);
    if (!res.ok) {
      setBioError(res.error ?? 'Uložení bio se nezdařilo.');
      return;
    }
    setNestBio(res.bio ?? null);
    setBioEditing(false);
    await refresh();
    setUser((prev) => (prev ? { ...prev, bio: res.bio ?? null } : prev));
    showSuccess('Popis „O mně“ byl uložen.');
  }

  async function onToggleProfessionalVisibility(next: boolean) {
    if (!apiAccessToken) return;
    if (!['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user?.role ?? '')) return;
    setVisibilitySaving(true);
    const res = await nestPatchProfessionalVisibility(apiAccessToken, next);
    setVisibilitySaving(false);
    if (!res.ok) {
      showSuccess(res.error ?? 'Uložení veřejnosti profilu se nezdařilo.');
      return;
    }
    setProfessionalVisibility(next);
    await loadNestProfile();
    showSuccess(next ? 'Profil je nyní veřejný.' : 'Profil je nyní neveřejný.');
  }

  function prefillAgentFormFromProfile() {
    const ap = nestMe?.agentProfile;
    if (ap) {
      setAgentFullName(ap.fullName);
      setAgentCompany(ap.companyName);
      setAgentPhone(ap.phone);
      setAgentWeb(ap.website || '');
      setAgentIco(ap.ico || '');
      setAgentCity(ap.city);
      setAgentBio(ap.bio);
      setAgentLogoUrl(ap.avatarUrl);
    } else {
      setAgentFullName(
        (nestMe?.name ?? user?.name ?? '').trim() || '',
      );
      setAgentCompany('');
      setAgentPhone('');
      setAgentWeb('');
      setAgentIco('');
      setAgentCity('');
      setAgentBio('');
      setAgentLogoUrl(null);
    }
  }

  function onOpenAgentForm() {
    setAgentFormError(null);
    prefillAgentFormFromProfile();
    setAgentFormOpen(true);
  }

  useEffect(() => {
    if (typeof window === 'undefined' || uctNavHandledRef.current || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const uct = params.get('uct');
    if (!uct) return;

    if (!canRequestProfessionalProfileUpgrade(user?.role)) {
      uctNavHandledRef.current = true;
      router.replace('/profil', { scroll: false });
      return;
    }

    uctNavHandledRef.current = true;
    if (uct === 'agent') {
      onOpenAgentForm();
    } else if (uct === 'company') {
      setCompanyFormOpen(true);
    } else if (uct === 'agency') {
      setAgencyFormOpen(true);
    } else if (uct === 'financial_advisor') {
      setAdvisorFormOpen(true);
    } else if (uct === 'investor') {
      setInvestorFormOpen(true);
    }

    router.replace('/profil', { scroll: false });
    window.requestAnimationFrame(() => {
      document.getElementById('rozsirovani-uctu')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jednorázová navigace z ?uct= po načtení profilu
  }, [isAuthenticated, user?.role, router]);

  async function onAgentLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = assertImageFile(file);
    if (err) {
      setAgentFormError(err);
      return;
    }
    setAgentFormError(null);
    setAgentLogoUploading(true);
    const res = await nestUploadAgentProfileLogo(apiAccessToken, file);
    setAgentLogoUploading(false);
    if (res.error) {
      setAgentFormError(res.error);
      return;
    }
    if (res.url) setAgentLogoUrl(res.url);
  }

  async function onSubmitAgentRequest(e: React.FormEvent) {
    e.preventDefault();
    setAgentFormError(null);
    const icoT = agentIco.trim();
    if (icoT && !/^\d{8}$/.test(icoT)) {
      setAgentFormError('IČO musí mít přesně 8 číslic nebo zůstat prázdné.');
      return;
    }
    if (agentBio.trim().length < 10) {
      setAgentFormError('Bio musí mít alespoň 10 znaků.');
      return;
    }
    setAgentSubmitting(true);
    const res = await nestSubmitAgentProfileRequest(apiAccessToken, {
      fullName: agentFullName.trim(),
      companyName: agentCompany.trim(),
      phone: agentPhone.trim(),
      website: agentWeb.trim() || undefined,
      ico: icoT || undefined,
      city: agentCity.trim(),
      bio: agentBio.trim(),
      avatarUrl: agentLogoUrl?.trim() || undefined,
    });
    setAgentSubmitting(false);
    if (!res.ok) {
      setAgentFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setAgentFormOpen(false);
    showSuccess(
      typeof res.data?.message === 'string'
        ? res.data.message
        : 'Žádost byla odeslána. Čeká na schválení administrátorem.',
    );
    await loadNestProfile();
  }

  async function onSubmitCompanyRequest(e: React.FormEvent) {
    e.preventDefault();
    setCompanyFormError(null);
    if (companyDesc.trim().length < 10 || companyServices.trim().length < 2) {
      setCompanyFormError('Vyplňte popis firmy a činnosti.');
      return;
    }
    setCompanySubmitting(true);
    const res = await nestSubmitCompanyProfileRequest(apiAccessToken, {
      companyName: companyName.trim(),
      contactFullName: companyContact.trim(),
      phone: companyPhone.trim(),
      email: companyEmail.trim(),
      website: companyWeb.trim() || undefined,
      ico: companyIco.trim() || undefined,
      city: companyCity.trim(),
      description: companyDesc.trim(),
      services: companyServices.trim(),
      logoUrl: companyLogoUrl?.trim() || undefined,
    });
    setCompanySubmitting(false);
    if (!res.ok) {
      setCompanyFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setCompanyFormOpen(false);
    showSuccess('Žádost stavební firmy byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  async function onSubmitAgencyRequest(e: React.FormEvent) {
    e.preventDefault();
    setAgencyFormError(null);
    if (agencyDesc.trim().length < 10) {
      setAgencyFormError('Vyplňte popis kanceláře.');
      return;
    }
    setAgencySubmitting(true);
    const res = await nestSubmitAgencyProfileRequest(apiAccessToken, {
      agencyName: agencyName.trim(),
      contactFullName: agencyContact.trim(),
      phone: agencyPhone.trim(),
      email: agencyEmail.trim(),
      website: agencyWeb.trim() || undefined,
      ico: agencyIco.trim() || undefined,
      city: agencyCity.trim(),
      description: agencyDesc.trim(),
      agentCount: agencyAgentCount.trim() ? Number(agencyAgentCount) : undefined,
      branchCities: agencyBranches
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
      logoUrl: agencyLogoUrl?.trim() || undefined,
    });
    setAgencySubmitting(false);
    if (!res.ok) {
      setAgencyFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setAgencyFormOpen(false);
    showSuccess('Žádost realitní kanceláře byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  async function onSubmitAdvisorRequest(e: React.FormEvent) {
    e.preventDefault();
    setAdvisorFormError(null);
    if (advisorBio.trim().length < 10) {
      setAdvisorFormError('Bio musí mít alespoň 10 znaků.');
      return;
    }
    const specializations = advisorSpecializations
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (specializations.length === 0) {
      setAdvisorFormError('Vyplňte alespoň jednu oblast specializace.');
      return;
    }
    setAdvisorSubmitting(true);
    const res = await nestSubmitFinancialAdvisorProfileRequest(apiAccessToken, {
      fullName: advisorFullName.trim(),
      brandName: advisorBrandName.trim() || undefined,
      phone: advisorPhone.trim(),
      email: advisorEmail.trim(),
      website: advisorWeb.trim() || undefined,
      ico: advisorIco.trim() || undefined,
      city: advisorCity.trim(),
      bio: advisorBio.trim(),
      specializations,
      avatarUrl: advisorAvatarUrl.trim() || undefined,
      logoUrl: advisorLogoUrl.trim() || undefined,
    });
    setAdvisorSubmitting(false);
    if (!res.ok) {
      setAdvisorFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setAdvisorFormOpen(false);
    showSuccess('Žádost finančního poradce byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  async function onSubmitInvestorRequest(e: React.FormEvent) {
    e.preventDefault();
    setInvestorFormError(null);
    if (investorBio.trim().length < 10) {
      setInvestorFormError('Bio musí mít alespoň 10 znaků.');
      return;
    }
    const investmentFocus = investorFocus
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (investmentFocus.length === 0) {
      setInvestorFormError('Vyplňte alespoň jedno investiční zaměření.');
      return;
    }
    setInvestorSubmitting(true);
    const res = await nestSubmitInvestorProfileRequest(apiAccessToken, {
      fullName: investorFullName.trim(),
      investorName: investorName.trim() || undefined,
      investorType: investorType.trim(),
      phone: investorPhone.trim(),
      email: investorEmail.trim(),
      website: investorWeb.trim() || undefined,
      city: investorCity.trim(),
      bio: investorBio.trim(),
      investmentFocus,
      avatarUrl: investorAvatarUrl.trim() || undefined,
      logoUrl: investorLogoUrl.trim() || undefined,
    });
    setInvestorSubmitting(false);
    if (!res.ok) {
      setInvestorFormError(res.error ?? 'Odeslání žádosti selhalo.');
      return;
    }
    setInvestorFormOpen(false);
    showSuccess('Žádost investora byla odeslána a čeká na schválení.');
    await loadNestProfile();
  }

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center overflow-y-auto bg-[#fafafa] text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto h-[100dvh] max-w-lg overflow-y-auto px-4 py-16 text-center">
        <p className="text-lg font-medium text-zinc-800">Nejste přihlášeni</p>
        <Link
          href="/login"
          className="mt-4 inline-block w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white md:w-auto md:px-8"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>
      </div>

      {successMsg ? (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          >
            {successMsg}
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
          {/* Cover */}
          <div
            className={`group relative aspect-[21/9] min-h-[140px] w-full sm:min-h-[168px] md:aspect-[3/1] md:min-h-[200px] ${
              'cursor-pointer'
            }`}
            onDoubleClick={(e) => {
              if (!displayCoverSrc) return;
              e.preventDefault();
              e.stopPropagation();
              openCoverEditorFromImage();
            }}
            onClick={(e) => {
              if (!isTouchLikeDevice()) {
                if (displayCoverSrc) return;
              }
              e.preventDefault();
              e.stopPropagation();
              openCoverEditorFromImage();
            }}
          >
            {displayCoverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayCoverSrc}
                alt=""
                className={`absolute inset-0 size-full ${coverCrop ? 'object-cover' : 'object-contain'}`}
                style={coverCrop ? imageCropToStyle(coverCrop) : undefined}
                onError={() => setCoverRemoteFailed(true)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-rose-400 to-violet-600 opacity-95" />
            )}
            {coverUploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-sm font-medium text-white backdrop-blur-[2px]">
                Nahrávám cover…
              </div>
            ) : null}
            <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/35 text-xs font-semibold text-white opacity-0 transition group-hover:flex group-hover:opacity-100 group-focus-within:flex group-focus-within:opacity-100 md:text-sm">
              {displayCoverSrc ? 'Chcete upravit obrázek?' : 'Nahrát titulní fotku'}
            </div>
          </div>

          <div className="relative px-4 pb-8 pt-0 sm:px-8">
            <div className="-mt-14 flex flex-col gap-6 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
                <div
                  className="group relative shrink-0 cursor-pointer"
                  onDoubleClick={(e) => {
                    if (!displayAvatarSrc) return;
                    e.preventDefault();
                    e.stopPropagation();
                    openAvatarEditorFromImage();
                  }}
                  onClick={(e) => {
                    if (!isTouchLikeDevice()) {
                      if (displayAvatarSrc) return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    openAvatarEditorFromImage();
                  }}
                >
                  <div className="rounded-full bg-white p-1 shadow-md ring-2 ring-white">
                    {displayAvatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={displayAvatarSrc}
                        alt=""
                        className="size-28 rounded-full object-cover sm:size-32"
                        style={imageCropToStyle(avatarCrop)}
                        onError={() => setAvatarRemoteFailed(true)}
                      />
                    ) : (
                      <div className="flex size-28 items-center justify-center rounded-full bg-zinc-100 text-3xl font-semibold text-zinc-500 sm:size-32">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {avatarUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white">
                        Nahrávám…
                      </div>
                    ) : null}
                    <div className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-full bg-black/40 px-3 text-center text-[10px] font-semibold text-white opacity-0 transition group-hover:flex group-hover:opacity-100 group-focus-within:flex group-focus-within:opacity-100 sm:text-xs">
                      {displayAvatarSrc
                        ? 'Chcete upravit obrázek?'
                        : 'Nahrát profilovou fotku'}
                    </div>
                  </div>
                </div>
                <div className="min-w-0 text-center sm:pb-1 sm:text-left">
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                      {user.email}
                    </h1>
                    {user.role === 'AGENT' ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        Ověřený makléř
                      </span>
                    ) : null}
                    {canRequestProfessionalProfileUpgrade(user.role) &&
                    nestMe?.agentProfile?.verificationStatus === 'pending' ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                        Čeká na ověření
                      </span>
                    ) : null}
                    {canRequestProfessionalProfileUpgrade(user.role) &&
                    nestMe?.agentProfile?.verificationStatus === 'rejected' ? (
                      <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
                        Žádost zamítnuta
                      </span>
                    ) : null}
                  </div>
                  {user.role === 'AGENT' ? (
                    <p className="mt-2 text-sm">
                      <Link
                        href={`/agent/${encodeURIComponent(user.id)}`}
                        className="font-semibold text-[#e85d00] hover:underline"
                      >
                        Veřejný profil makléře
                      </Link>
                    </p>
                  ) : null}
                  {bioText && !bioEditing ? (
                    <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {bioText}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  disabled={avatarUploading || !apiAccessToken}
                  onChange={(ev) => void onAvatarChange(ev)}
                />
                <input
                  ref={coverInputRef}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  disabled={coverUploading || !apiAccessToken}
                  onChange={(ev) => void onCoverChange(ev)}
                />
                {coverSrc ? (
                  <button
                    type="button"
                    disabled={coverUploading || !apiAccessToken}
                    onClick={() => void onDeleteCover()}
                    className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Smazat cover
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!apiAccessToken}
                  onClick={() => {
                    setBioEditing((v) => !v);
                    setBioDraft(bioText ?? '');
                    setBioError(null);
                  }}
                  className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-900 transition hover:bg-orange-100 disabled:opacity-50"
                >
                  {bioEditing ? 'Zrušit úpravu bio' : 'Upravit bio'}
                </button>
              </div>
            </div>

            {['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user.role) ? (
              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                <h3 className="text-sm font-semibold text-zinc-900">Veřejnost profilu</h3>
                <p className="mt-1 text-xs text-zinc-600">
                  Neveřejný profil vidí pouze vlastník a administrátor.
                </p>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={professionalVisibility}
                    disabled={visibilitySaving || !apiAccessToken}
                    onChange={(e) => void onToggleProfessionalVisibility(e.target.checked)}
                    className="size-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-800">
                    {professionalVisibility ? 'Profil je veřejný' : 'Profil je neveřejný'}
                  </span>
                </label>
              </div>
            ) : null}

            {avatarError ? (
              <p className="mt-4 text-sm text-red-600">{avatarError}</p>
            ) : null}
            {coverError ? (
              <p className="mt-2 text-sm text-red-600">{coverError}</p>
            ) : null}

            {bioEditing ? (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                <label className="block text-sm font-semibold text-zinc-800">
                  O mně (max. {BIO_MAX} znaků)
                </label>
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={5}
                  maxLength={BIO_MAX}
                  className="mt-2 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                  placeholder="Krátký popis o sobě…"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    {bioDraft.length}/{BIO_MAX}
                  </span>
                  <button
                    type="button"
                    disabled={bioSaving || !apiAccessToken}
                    onClick={() => void onSaveBio()}
                    className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    {bioSaving ? 'Ukládám…' : 'Uložit bio'}
                  </button>
                </div>
                {bioError ? <p className="mt-2 text-sm text-red-600">{bioError}</p> : null}
              </div>
            ) : null}

            {!apiAccessToken ? (
              <p className="mt-6 text-xs text-amber-800">
                Pro změny profilu přes Nest API nastavte{' '}
                <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> a přihlaste se
                (JWT v cookie).
              </p>
            ) : null}
          </div>
        </section>

        {canRequestProfessionalProfileUpgrade(user.role) ? (
          <section
            id="rozsirovani-uctu"
            className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-zinc-900">Rozšířit účet</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Vyberte typ profesionálního účtu. Role se přepne až po schválení administrátorem.
            </p>
            {nestMe?.agentProfile?.verificationStatus === 'pending' ? (
              <p className="mt-3 text-sm font-medium text-amber-800">
                Vaše žádost čeká na schválení. Můžete ji upravit a znovu odeslat.
              </p>
            ) : null}
            {nestMe?.agentProfile?.verificationStatus === 'rejected' ? (
              <p className="mt-3 text-sm font-medium text-zinc-700">
                Předchozí žádost byla zamítnuta. Upravte údaje a pošlete novou žádost.
              </p>
            ) : null}
            {!agentFormOpen &&
            !companyFormOpen &&
            !agencyFormOpen &&
            !advisorFormOpen &&
            !investorFormOpen ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenAgentForm()}
                  className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105"
                >
                  Jsem makléř
                </button>
                <button
                  type="button"
                  onClick={() => setCompanyFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Mám stavební firmu
                </button>
                <button
                  type="button"
                  onClick={() => setAgencyFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Jsem realitní kancelář
                </button>
                <button
                  type="button"
                  onClick={() => setAdvisorFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Jsem finanční poradce
                </button>
                <button
                  type="button"
                  onClick={() => setInvestorFormOpen(true)}
                  className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  Jsem investor
                </button>
              </div>
            ) : null}
            {agentFormOpen ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={(ev) => void onSubmitAgentRequest(ev)}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold text-zinc-800">
                    Jméno a příjmení
                    <input
                      required
                      value={agentFullName}
                      onChange={(e) => setAgentFullName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Název kanceláře nebo značky
                    <input
                      required
                      value={agentCompany}
                      onChange={(e) => setAgentCompany(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Telefonní číslo
                    <input
                      required
                      value={agentPhone}
                      onChange={(e) => setAgentPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <div className="block text-sm font-semibold text-zinc-800">
                    <span>Stav telefonu</span>
                    <p className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-normal text-zinc-700">
                      {nestMe?.agentProfile?.phoneVerified
                        ? 'Telefon ověřen'
                        : 'Telefon neověřen (SMS ověření připravujeme)'}
                    </p>
                  </div>
                  <label className="block text-sm font-semibold text-zinc-800 sm:col-span-2">
                    Webová stránka (volitelné)
                    <input
                      value={agentWeb}
                      onChange={(e) => setAgentWeb(e.target.value)}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    IČO (volitelné, 8 číslic)
                    <input
                      value={agentIco}
                      onChange={(e) => setAgentIco(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                  <label className="block text-sm font-semibold text-zinc-800">
                    Město / lokalita působnosti
                    <input
                      required
                      value={agentCity}
                      onChange={(e) => setAgentCity(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                    />
                  </label>
                </div>
                <label className="block text-sm font-semibold text-zinc-800">
                  Krátké bio (min. 10 znaků)
                  <textarea
                    required
                    value={agentBio}
                    onChange={(e) => setAgentBio(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                  />
                </label>
                <div>
                  <p className="text-sm font-semibold text-zinc-800">Profilová fotka nebo logo</p>
                  <input
                    ref={agentLogoInputRef}
                    type="file"
                    accept={ACCEPT_IMAGES}
                    className="hidden"
                    disabled={agentLogoUploading}
                    onChange={(ev) => void onAgentLogoChange(ev)}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={agentLogoUploading}
                      onClick={() => agentLogoInputRef.current?.click()}
                      className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {agentLogoUploading ? 'Nahrávám…' : 'Nahrát obrázek'}
                    </button>
                    {agentLogoUrl ? (
                      <span className="text-xs text-zinc-600">Nahráno</span>
                    ) : (
                      <span className="text-xs text-zinc-500">Volitelné</span>
                    )}
                  </div>
                </div>
                {agentFormError ? (
                  <p className="text-sm text-red-600" role="alert">
                    {agentFormError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={agentSubmitting}
                    className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
                  >
                    {agentSubmitting ? 'Odesílám…' : 'Odeslat žádost'}
                  </button>
                  <button
                    type="button"
                    disabled={agentSubmitting}
                    onClick={() => {
                      setAgentFormOpen(false);
                      setAgentFormError(null);
                    }}
                    className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Zrušit
                  </button>
                </div>
              </form>
            ) : null}
            {companyFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitCompanyRequest(e)}>
                <input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Název firmy" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={companyContact} onChange={(e) => setCompanyContact(e.target.value)} placeholder="Kontaktní osoba" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={companyWeb} onChange={(e) => setCompanyWeb(e.target.value)} placeholder="Web" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={companyIco} onChange={(e) => setCompanyIco(e.target.value)} placeholder="IČO" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={companyCity} onChange={(e) => setCompanyCity(e.target.value)} placeholder="Město / lokalita" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={companyLogoUrl ?? ''} onChange={(e) => setCompanyLogoUrl(e.target.value)} placeholder="Logo URL" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <textarea required value={companyDesc} onChange={(e) => setCompanyDesc(e.target.value)} placeholder="Krátký popis firmy" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <textarea required value={companyServices} onChange={(e) => setCompanyServices(e.target.value)} placeholder="Co firma provádí" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                {companyFormError ? <p className="text-sm text-red-600 sm:col-span-2">{companyFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={companySubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{companySubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setCompanyFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
            {agencyFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitAgencyRequest(e)}>
                <input required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Název kanceláře" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={agencyContact} onChange={(e) => setAgencyContact(e.target.value)} placeholder="Odpovědná osoba" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={agencyPhone} onChange={(e) => setAgencyPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={agencyEmail} onChange={(e) => setAgencyEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyWeb} onChange={(e) => setAgencyWeb(e.target.value)} placeholder="Web" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyIco} onChange={(e) => setAgencyIco(e.target.value)} placeholder="IČO" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={agencyCity} onChange={(e) => setAgencyCity(e.target.value)} placeholder="Město / působnost" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyLogoUrl ?? ''} onChange={(e) => setAgencyLogoUrl(e.target.value)} placeholder="Logo URL" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyAgentCount} onChange={(e) => setAgencyAgentCount(e.target.value)} placeholder="Počet makléřů (volitelně)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={agencyBranches} onChange={(e) => setAgencyBranches(e.target.value)} placeholder="Pobočky / města (oddělit čárkou)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <textarea required value={agencyDesc} onChange={(e) => setAgencyDesc(e.target.value)} placeholder="Popis kanceláře" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                {agencyFormError ? <p className="text-sm text-red-600 sm:col-span-2">{agencyFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={agencySubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{agencySubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setAgencyFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
            {advisorFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitAdvisorRequest(e)}>
                <input required value={advisorFullName} onChange={(e) => setAdvisorFullName(e.target.value)} placeholder="Jméno a příjmení" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorBrandName} onChange={(e) => setAdvisorBrandName(e.target.value)} placeholder="Název značky / firmy (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={advisorPhone} onChange={(e) => setAdvisorPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={advisorEmail} onChange={(e) => setAdvisorEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorWeb} onChange={(e) => setAdvisorWeb(e.target.value)} placeholder="Web (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorIco} onChange={(e) => setAdvisorIco(e.target.value)} placeholder="IČO (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={advisorCity} onChange={(e) => setAdvisorCity(e.target.value)} placeholder="Město / oblast působnosti" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <textarea required value={advisorBio} onChange={(e) => setAdvisorBio(e.target.value)} placeholder="Krátké bio" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={advisorSpecializations} onChange={(e) => setAdvisorSpecializations(e.target.value)} placeholder="Oblasti specializace (oddělit čárkou)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input value={advisorAvatarUrl} onChange={(e) => setAdvisorAvatarUrl(e.target.value)} placeholder="Profilová fotka URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={advisorLogoUrl} onChange={(e) => setAdvisorLogoUrl(e.target.value)} placeholder="Logo URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                {advisorFormError ? <p className="text-sm text-red-600 sm:col-span-2">{advisorFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={advisorSubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{advisorSubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setAdvisorFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
            {investorFormOpen ? (
              <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void onSubmitInvestorRequest(e)}>
                <input required value={investorFullName} onChange={(e) => setInvestorFullName(e.target.value)} placeholder="Jméno a příjmení / název investora" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Název investora (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={investorType} onChange={(e) => setInvestorType(e.target.value)} placeholder="Typ investora" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={investorPhone} onChange={(e) => setInvestorPhone(e.target.value)} placeholder="Telefon" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required type="email" value={investorEmail} onChange={(e) => setInvestorEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={investorWeb} onChange={(e) => setInvestorWeb(e.target.value)} placeholder="Web (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input required value={investorCity} onChange={(e) => setInvestorCity(e.target.value)} placeholder="Město / lokalita" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <textarea required value={investorBio} onChange={(e) => setInvestorBio(e.target.value)} placeholder="Bio" rows={3} className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input required value={investorFocus} onChange={(e) => setInvestorFocus(e.target.value)} placeholder="Investiční zaměření (oddělit čárkou)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm sm:col-span-2" />
                <input value={investorAvatarUrl} onChange={(e) => setInvestorAvatarUrl(e.target.value)} placeholder="Profilová fotka URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                <input value={investorLogoUrl} onChange={(e) => setInvestorLogoUrl(e.target.value)} placeholder="Logo URL (volitelné)" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm" />
                {investorFormError ? <p className="text-sm text-red-600 sm:col-span-2">{investorFormError}</p> : null}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="submit" disabled={investorSubmitting} className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{investorSubmitting ? 'Odesílám…' : 'Odeslat žádost'}</button>
                  <button type="button" onClick={() => setInvestorFormOpen(false)} className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800">Zrušit</button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Shorts koncepty</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Koncepty zůstávají mimo feed, dokud je v editoru nezveřejníte.
          </p>
          {!apiAccessToken ? (
            <p className="mt-4 text-sm text-amber-800">
              Pro seznam konceptů je potřeba přihlášení s JWT k Nest API.
            </p>
          ) : shortsDrafts.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím nemáte žádný rozpracovaný shorts koncept. Vytvoříte ho tlačítkem „Převést na
              Shorts“ u klasického inzerátu níže.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {shortsDrafts.map((d) => {
                const st =
                  d.status === 'ready'
                    ? 'Připraveno (náhled / publikace)'
                    : d.status === 'draft'
                      ? 'Koncept'
                      : d.status;
                const thumb =
                  d.coverImage?.trim() &&
                  (/^https?:\/\//i.test(d.coverImage)
                    ? d.coverImage
                    : nestAbsoluteAssetUrl(d.coverImage) || d.coverImage);
                return (
                  <li
                    key={d.id}
                    className="flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg bg-zinc-200 sm:h-20 sm:w-32">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-zinc-500">
                          Bez náhledu
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900">{d.title || 'Bez názvu'}</p>
                      <p className="text-xs text-zinc-600">{st}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        Zdroj:{' '}
                        <Link
                          href={`/nemovitost/${d.sourceListingId}`}
                          className="font-medium text-[#e85d00] hover:underline"
                        >
                          klasický inzerát
                        </Link>
                      </p>
                    </div>
                    <Link
                      href={`/inzerat/shorts-editor/${d.id}`}
                      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-bold text-white shadow-sm"
                    >
                      Editor
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Příspěvky</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Veřejná zeď publikovaných příspěvků, videí a promo obsahu profilu.
          </p>
          {wallLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Načítám příspěvky…</p>
          ) : wallPosts.length === 0 && wallVideos.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím nejsou k dispozici žádné publikované příspěvky.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {wallPosts.map((post) => {
                const media =
                  Array.isArray(post.media) && post.media.length > 0
                    ? post.media.find((m) => typeof m?.url === 'string' && m.url.trim()) ?? null
                    : null;
                const mediaUrl =
                  media?.url && /^https?:\/\//i.test(media.url)
                    ? media.url
                    : media?.url
                      ? nestAbsoluteAssetUrl(media.url) || media.url
                      : null;
                return (
                  <article
                    key={`post-${post.id}`}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-4"
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      {post.title?.trim() || 'Příspěvek'}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {post.createdAt ? new Date(post.createdAt).toLocaleString('cs-CZ') : ''}
                    </p>
                    {(post.content || post.description) && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                        {post.content || post.description}
                      </p>
                    )}
                    {mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl} alt="" className="mt-3 h-44 w-full rounded-lg object-cover" />
                    ) : null}
                  </article>
                );
              })}
              {wallVideos.map((video) => {
                const vurl =
                  video.url && /^https?:\/\//i.test(video.url)
                    ? video.url
                    : video.url
                      ? nestAbsoluteAssetUrl(video.url) || video.url
                      : null;
                return (
                  <article
                    key={`video-${video.id}`}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-4"
                  >
                    <p className="text-sm font-semibold text-zinc-900">Video příspěvek</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {video.createdAt ? new Date(video.createdAt).toLocaleString('cs-CZ') : ''}
                    </p>
                    {video.description ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                        {video.description}
                      </p>
                    ) : null}
                    {vurl ? (
                      <video
                        src={vurl}
                        className="mt-3 max-h-72 w-full rounded-lg bg-black"
                        controls
                        preload="metadata"
                      />
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Vlastní inzeráty</h2>
            {canCreateProfessionalListingsAndPosts(user.role) ? (
              <Link
                href="/inzerat/pridat"
                className="inline-flex w-full shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105 sm:w-auto sm:px-8"
              >
                Vytvořit inzerát
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setProfessionalListingDialogOpen(true)}
                className="inline-flex w-full shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-105 sm:w-auto sm:px-8"
              >
                Vytvořit inzerát
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            Samostatný katalog vašich realitních nabídek (prodej, pronájem, klasické i shorts inzeráty).
          </p>
          {!apiAccessToken ? (
            <p className="mt-4 text-sm text-amber-800">
              Pro seznam inzerátů je potřeba přihlášení s JWT k Nest API.
            </p>
          ) : listingsLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Načítám inzeráty…</p>
          ) : listingsError ? (
            <p className="mt-4 text-sm text-red-600">{listingsError}</p>
          ) : myListings.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím nemáte žádný inzerát. Vytvořte první pomocí tlačítka výše.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {myListings.map((row) => {
                const statusLabel =
                  LISTING_STATUS_LABEL[row.dashboardStatus] ?? row.dashboardStatus;
                const typeLabel = row.listingType === 'SHORTS' ? 'Shorts' : 'Klasik';
                const cover = row.coverUrl?.trim() ?? null;
                const isVideoish =
                  row.listingType === 'SHORTS' ||
                  Boolean(cover && /\.(mp4|webm|mov)(\?|$)/i.test(cover));
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 sm:flex-row sm:items-stretch"
                  >
                    <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-lg bg-zinc-200 sm:h-auto sm:w-40">
                      {cover && !isVideoish ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            /^https?:\/\//i.test(cover)
                              ? cover
                              : nestAbsoluteAssetUrl(cover) || cover
                          }
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : cover && isVideoish ? (
                        <div className="flex size-full items-center justify-center bg-zinc-800 text-3xl text-white">
                          ▶
                        </div>
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-zinc-500">
                          Bez náhledu
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900">{row.title}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                        <span>
                          Typ: <strong className="text-zinc-800">{typeLabel}</strong>
                        </span>
                        <span>
                          Cena:{' '}
                          <strong className="text-zinc-800">
                            {row.price.toLocaleString('cs-CZ')} {row.currency}
                          </strong>
                        </span>
                        <span>
                          Lokalita:{' '}
                          <strong className="text-zinc-800">
                            {row.city}
                            {row.region ? ` · ${row.region}` : ''}
                          </strong>
                        </span>
                        <span>
                          Stav: <strong className="text-zinc-800">{statusLabel}</strong>
                        </span>
                        <span>
                          Vytvořeno:{' '}
                          <strong className="text-zinc-800">
                            {new Date(row.createdAt).toLocaleDateString('cs-CZ')}
                          </strong>
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={
                            row.listingType === 'SHORTS' && row.shortsListingId
                              ? `/inzerat/shorts-editor/${row.shortsListingId}`
                              : `/inzerat/upravit/${row.id}`
                          }
                          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          {row.listingType === 'SHORTS' ? 'Upravit shorts' : 'Upravit'}
                        </Link>
                        <Link
                          href={`/nemovitost/${row.id}`}
                          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        >
                          Zobrazit
                        </Link>
                        {row.dashboardStatus === 'ACTIVE' ||
                        row.dashboardStatus === 'SCHEDULED' ? (
                          <button
                            type="button"
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                            onClick={() => {
                              if (!apiAccessToken) return;
                              void nestPatchMyProperty(apiAccessToken, row.id, {
                                isActive: false,
                              }).then((r) => {
                                if (r.ok) void loadMyListings();
                                else window.alert(r.error ?? 'Nepodařilo se deaktivovat.');
                              });
                            }}
                          >
                            Deaktivovat
                          </button>
                        ) : row.dashboardStatus === 'INACTIVE' ? (
                          <button
                            type="button"
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                            onClick={() => {
                              if (!apiAccessToken) return;
                              void nestPatchMyProperty(apiAccessToken, row.id, {
                                isActive: true,
                              }).then((r) => {
                                if (r.ok) void loadMyListings();
                                else window.alert(r.error ?? 'Nepodařilo se aktivovat.');
                              });
                            }}
                          >
                            Aktivovat
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (!apiAccessToken) return;
                            const isShorts = row.listingType === 'SHORTS';
                            const msg = isShorts
                              ? row.shortsListingId
                                ? 'Smazat tento shorts inzerát? Zmizí z profilu i z veřejného shorts feedu.'
                                : 'Smazat tento shorts inzerát? (starší záznam bez editoru — smaže se veřejný inzerát.)'
                              : 'Opravdu chcete inzerát smazat? Bude skrytý a nepůjde ho obnovit bez administrátora.';
                            if (!window.confirm(msg)) return;
                            if (isShorts && row.shortsListingId) {
                              void nestDeleteShortsListing(apiAccessToken, row.shortsListingId).then(
                                (r) => {
                                  if (r.ok) {
                                    void loadMyListings();
                                    void loadShortsDrafts();
                                  } else window.alert(r.error ?? 'Smazání shorts se nezdařilo.');
                                },
                              );
                              return;
                            }
                            void nestDeleteMyProperty(apiAccessToken, row.id).then((r) => {
                              if (r.ok) {
                                void loadMyListings();
                                void loadShortsDrafts();
                              } else window.alert(r.error ?? 'Smazání se nezdařilo.');
                            });
                          }}
                        >
                          Smazat
                        </button>
                      </div>
                      {row.listingType === 'CLASSIC' ? (
                        <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5 text-xs">
                          {row.shortsVariant ? (
                            <>
                              <p className="font-semibold text-orange-950">
                                Shorts:{' '}
                                <span className="font-normal text-zinc-800">
                                  {LISTING_STATUS_LABEL[row.shortsVariant.dashboardStatus] ??
                                    row.shortsVariant.dashboardStatus}
                                </span>
                                {row.shortsVariant.dashboardStatus === 'ACTIVE' ? (
                                  <span className="ml-1.5 font-medium text-emerald-700">
                                    · aktivní ve výpisu
                                  </span>
                                ) : null}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Link
                                  href={`/nemovitost/${row.shortsVariant.id}`}
                                  className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-50"
                                >
                                  Zobrazit shorts
                                </Link>
                                <Link
                                  href={`/inzerat/upravit/${row.shortsVariant.id}`}
                                  className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-50"
                                >
                                  Upravit shorts
                                </Link>
                              </div>
                            </>
                          ) : row.shortsDraft ? (
                            <>
                              <p className="font-semibold text-orange-950">
                                Koncept shorts:{' '}
                                <span className="font-normal text-zinc-800">
                                  {row.shortsDraft.status === 'ready'
                                    ? 'Připraveno k náhledu / publikaci'
                                    : 'Rozpracováno'}
                                </span>
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Link
                                  href={`/inzerat/shorts-editor/${row.shortsDraft.id}`}
                                  className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-900 hover:bg-orange-50"
                                >
                                  Otevřít editor
                                </Link>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-zinc-700">
                                Převeďte klasický inzerát na shorts — nejdřív koncept v editoru, pak
                                zveřejnění do feedu.
                              </p>
                              <button
                                type="button"
                                disabled={!apiAccessToken || shortsCreatingId === row.id}
                                className="mt-2 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-50"
                                onClick={() => {
                                  if (!apiAccessToken) return;
                                  if (
                                    !window.confirm(
                                      'Vytvoří se koncept shorts s fotkami z tohoto inzerátu. Upravíte pořadí, text a hudbu v editoru a až potom zveřejníte do feedu.',
                                    )
                                  ) {
                                    return;
                                  }
                                  setShortsCreatingId(row.id);
                                  void nestCreateShortsFromClassic(apiAccessToken, row.id).then(
                                    (r) => {
                                      setShortsCreatingId(null);
                                      if (!r.ok || !r.shortsListingId) {
                                        window.alert(r.error ?? 'Nepodařilo se vytvořit koncept.');
                                        return;
                                      }
                                      void loadMyListings();
                                      void loadShortsDrafts();
                                      router.push(`/inzerat/shorts-editor/${r.shortsListingId}`);
                                    },
                                  );
                                }}
                              >
                                {shortsCreatingId === row.id
                                  ? 'Vytvářím koncept…'
                                  : 'Převést na Shorts'}
                              </button>
                            </>
                          )}
                        </div>
                      ) : row.derivedFromPropertyId ? (
                        <p className="mt-3 text-xs text-zinc-600">
                          Shorts vychází z klasického inzerátu{' '}
                          <Link
                            href={`/nemovitost/${row.derivedFromPropertyId}`}
                            className="font-semibold text-[#e85d00] hover:underline"
                          >
                            otevřít klasik
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">Oblíbené nemovitosti</h2>
          {favLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Načítám oblíbené…</p>
          ) : favError ? (
            <p className="mt-4 text-sm text-red-600">{favError}</p>
          ) : favorites.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím žádné — přidejte ❤️ u nemovitosti na hlavní stránce.
            </p>
          ) : (
            <div className="mt-4">
              <PropertyGrid properties={favorites} />
            </div>
          )}
        </section>

        {user.role === 'AGENT' && nestMe ? (
          <section id="makler-premium" className="mt-10 space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Veřejný profil makléře</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Zapněte zobrazení v katalogu makléřů a volitelně přijímejte hodnocení. Údaje níže
                se zobrazí jen na veřejné stránce.
              </p>
              {nestMe.brokerProfileSlug && nestMe.isPublicBrokerProfile ? (
                <p className="mt-2 text-sm">
                  <Link
                    href={`/makler/${encodeURIComponent(nestMe.brokerProfileSlug)}`}
                    className="font-semibold text-[#e85d00] hover:underline"
                  >
                    Otevřít veřejný profil →
                  </Link>
                </p>
              ) : null}
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-zinc-300"
                  checked={nestMe.isPublicBrokerProfile === true}
                  disabled={!apiAccessToken}
                  onChange={() => {
                    if (!apiAccessToken) return;
                    const next = !nestMe.isPublicBrokerProfile;
                    void nestPatchBrokerPublicProfile(apiAccessToken, {
                      isPublicBrokerProfile: next,
                    }).then((r) => {
                      if (r.ok) void loadNestProfile();
                    });
                  }}
                />
                <span>
                  <span className="font-semibold">Zobrazovat můj profil veřejně</span>
                  <span className="mt-0.5 block text-xs text-zinc-600">
                    Objevíte se v přehledu makléřů na webu.
                  </span>
                </span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-zinc-300"
                  checked={nestMe.allowBrokerReviews === true}
                  disabled={!apiAccessToken}
                  onChange={() => {
                    if (!apiAccessToken) return;
                    const next = !nestMe.allowBrokerReviews;
                    void nestPatchBrokerPublicProfile(apiAccessToken, {
                      allowBrokerReviews: next,
                    }).then((r) => {
                      if (r.ok) void loadNestProfile();
                    });
                  }}
                />
                <span>
                  <span className="font-semibold">Povolit hodnocení a recenze</span>
                  <span className="mt-0.5 block text-xs text-zinc-600">
                    Přihlášení uživatelé vám mohou dát hvězdičky a napsat recenzi (jednou na účet,
                    lze upravit).
                  </span>
                </span>
              </label>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-zinc-700">
                  Kancelář / značka
                  <input
                    value={brokerOffice}
                    onChange={(e) => setBrokerOffice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">
                  Specializace
                  <input
                    value={brokerSpec}
                    onChange={(e) => setBrokerSpec(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">
                  Region působnosti
                  <input
                    value={brokerRegion}
                    onChange={(e) => setBrokerRegion(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">
                  Web
                  <input
                    value={brokerWeb}
                    onChange={(e) => setBrokerWeb(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="https://…"
                  />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">
                  Veřejný telefon
                  <input
                    value={brokerPhone}
                    onChange={(e) => setBrokerPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-zinc-700">
                  Veřejný e-mail
                  <input
                    value={brokerEmailPub}
                    onChange={(e) => setBrokerEmailPub(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              {brokerFieldsError ? (
                <p className="mt-2 text-sm text-red-600">{brokerFieldsError}</p>
              ) : null}
              <button
                type="button"
                disabled={brokerFieldsSaving || !apiAccessToken}
                className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  if (!apiAccessToken) return;
                  setBrokerFieldsError(null);
                  setBrokerFieldsSaving(true);
                  void nestPatchBrokerPublicProfile(apiAccessToken, {
                    brokerOfficeName: brokerOffice,
                    brokerSpecialization: brokerSpec,
                    brokerRegionLabel: brokerRegion,
                    brokerWeb,
                    brokerPhonePublic: brokerPhone,
                    brokerEmailPublic: brokerEmailPub,
                  }).then((r) => {
                    setBrokerFieldsSaving(false);
                    if (!r.ok) {
                      setBrokerFieldsError(r.error ?? 'Uložení se nezdařilo.');
                      return;
                    }
                    void loadNestProfile();
                    showSuccess('Údaje veřejného profilu byly uloženy.');
                  });
                }}
              >
                {brokerFieldsSaving ? 'Ukládám…' : 'Uložit údaje veřejného profilu'}
              </button>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Premium makléř a odměny</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Za přidání inzerátu nebo video příspěvku získáváte body. Po dosažení nastavené hranice
                se vám odemknou leady zdarma k prvnímu oslovení vlastníka bez prémiového účtu.
                Prémiový účet nastaví administrátor.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span
                  className={`rounded-full px-3 py-1 ${nestMe.isPremiumBroker ? 'bg-emerald-100 text-emerald-900' : 'bg-zinc-100 text-zinc-700'}`}
                >
                  Premium: {nestMe.isPremiumBroker ? 'ano' : 'ne'}
                </span>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-900">
                  Body: {nestMe.brokerPoints ?? 0}
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">
                  Volné leady: {nestMe.brokerFreeLeads ?? 0}
                </span>
              </div>
              {nestMe.brokerProgress ? (
                <p className="mt-3 text-sm text-zinc-700">
                  Do další odměny zbývá přibližně{' '}
                  <strong>{nestMe.brokerProgress.pointsToNextReward}</strong> bodů (práh{' '}
                  {nestMe.brokerProgress.rewardThresholdPoints}, odměna +{' '}
                  {nestMe.brokerProgress.freeLeadsPerThreshold} leady).
                </p>
              ) : null}
              <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  className="mt-1 size-4 rounded border-zinc-300"
                  checked={nestMe.brokerLeadNotificationEnabled !== false}
                  disabled={!apiAccessToken}
                  onChange={() => {
                    if (!apiAccessToken) return;
                    const current = nestMe.brokerLeadNotificationEnabled !== false;
                    void nestPatchBrokerLeadPrefs(apiAccessToken, {
                      brokerLeadNotificationEnabled: !current,
                    }).then((r) => {
                      if (r.ok) void loadNestProfile();
                    });
                  }}
                />
                <span>
                  <span className="font-semibold">Chci notifikace o nových inzerátech od vlastníků</span>
                  <span className="mt-0.5 block text-xs font-normal text-zinc-600">
                    Respektuje vaše níže uvedené preference krajů a typů nemovitostí (prázdné = vše).
                  </span>
                </span>
              </label>
            </div>

            <div id="notifikace" className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-zinc-900">Notifikace</h2>
                <button
                  type="button"
                  disabled={notifLoading || !apiAccessToken}
                  onClick={() => void loadNotifications()}
                  className="text-xs font-semibold text-[#e85d00] hover:underline disabled:opacity-50"
                >
                  Obnovit
                </button>
              </div>
              {notifLoading ? (
                <p className="mt-3 text-sm text-zinc-500">Načítám…</p>
              ) : notifications.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">Zatím žádné notifikace.</p>
              ) : (
                <ul className="mt-4 divide-y divide-zinc-100">
                  {notifications.map((n) => (
                    <li key={n.id} className="py-3">
                      <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
                      <p className="mt-1 text-sm text-zinc-600">{n.body}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {!n.readAt ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-[#e85d00] hover:underline"
                            onClick={() => {
                              if (!apiAccessToken) return;
                              void nestMarkNotificationRead(apiAccessToken, n.id).then((ok) => {
                                if (ok) void loadNotifications();
                              });
                            }}
                          >
                            Označit jako přečtené
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400">Přečteno</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Zprávy</h2>
            {unreadMessages > 0 ? (
              <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">
                {unreadMessages > 99 ? '99+' : unreadMessages} nových
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Doručené a odeslané zprávy k inzerátům. Po otevření konverzace se nepřečtené označí jako
            přečtené.
          </p>
          <Link
            href="/profil/zpravy"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
          >
            Otevřít schránku
          </Link>
        </section>

        {['AGENT', 'COMPANY', 'AGENCY', 'FINANCIAL_ADVISOR', 'INVESTOR'].includes(user.role) ? (
          <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Nastavení reklam</h2>
            {user.role === 'COMPANY' ? (
              <>
                <p className="mt-2 text-sm text-zinc-600">
                  Správa reklam stavební firmy navázaných na profil a feed inzerátů.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">
                    Aktivní: {activeCompanyAds}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700">
                    Neaktivní: {inactiveCompanyAds}
                  </span>
                </div>
                <Link
                  href={dashboardPathForRole('COMPANY')}
                  className="mt-4 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white shadow-sm"
                >
                  Otevřít správu reklam
                </Link>
              </>
            ) : user.role === 'AGENCY' ? (
              <p className="mt-2 text-sm text-zinc-600">
                Profilové promo kanceláře je připravené pro navazující rozšíření. Zde bude přehled
                aktivních/neaktivních reklam a jejich správa.
              </p>
            ) : (
              <p className="mt-2 text-sm text-zinc-600">
                Osobní promo makléře je připravené pro navazující rozšíření. Zde bude přehled a správa
                reklamních bloků.
              </p>
            )}
          </section>
        ) : null}

      </div>

      <ProfessionalOnlyDialog
        open={professionalListingDialogOpen}
        onClose={() => setProfessionalListingDialogOpen(false)}
      />
      <ImageCropEditorModal
        open={avatarCropOpen}
        title="Upravit profilovou fotku"
        imageUrl={avatarCropImageUrl}
        aspect="square"
        initialCrop={avatarCrop}
        onCancel={() => {
          if (pendingAvatarFile && avatarPreview) {
            URL.revokeObjectURL(avatarPreview);
            setAvatarPreview(null);
          }
          setPendingAvatarFile(null);
          setAvatarCropOpen(false);
          setAvatarCropImageUrl(null);
        }}
        onSave={(crop) => void onSaveAvatarCrop(crop)}
      />
      <ImageCropEditorModal
        open={coverCropOpen}
        title="Upravit cover fotku"
        imageUrl={coverCropImageUrl}
        aspect="cover"
        initialCrop={pendingCoverFile ? null : coverCrop}
        fitWholeOnOpen={Boolean(pendingCoverFile)}
        onCancel={() => {
          if (pendingCoverFile && coverPreview) {
            URL.revokeObjectURL(coverPreview);
            setCoverPreview(null);
          }
          if (pendingCoverFile) {
            setCoverCrop(previousCoverCropRef.current ?? null);
            previousCoverCropRef.current = null;
          }
          setPendingCoverFile(null);
          setCoverCropOpen(false);
          setCoverCropImageUrl(null);
        }}
        onSave={(crop) => void onSaveCoverCrop(crop)}
      />
    </div>
  );
}
